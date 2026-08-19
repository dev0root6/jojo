import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  addManager,
  analyzeIdleCode,
  askSensei,
  assignQuestion,
  explainCode,
  getActiveRoom,
  getProgress,
  getSettings,
  leaveRoom,
  login,
  logout,
  me,
  register,
  runAssignedC,
  stuckHelp,
  submitQuestion,
  updateSettings,
  type AppSettings,
  type AuthUser,
  type ChatMessage,
  type QuestionAssignment,
  type RoomInfo,
  type RunResult,
  type TestOutcome,
  type StudentProgress,
} from './api';
import DiagramPanel from './DiagramPanel';
import EditorPanel from './EditorPanel';
import LearningPanel from './LearningPanel';
import SenseiPanel from './SenseiPanel';
import RoomLandingModal from './RoomLandingModal';
import ManagerDashboard from './ManagerDashboard';
import { starterCode } from './examples';
import { cheatSections, practiceQuestions } from './learningContent';
import Header from './Header';
import Footer from './Footer';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('jojo-theme') as 'light' | 'dark') ||
           (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  });

  // Which side panels are open. Remembered per browser so a student who wants
  // the widest possible editor does not have to collapse them again each visit.
  const [panels, setPanels] = useState<{ learning: boolean; diagram: boolean; sensei: boolean }>(() => {
    const stored = localStorage.getItem('jojo_panels');
    const fallback = { learning: true, diagram: true, sensei: true };
    if (!stored) return fallback;
    try {
      return { ...fallback, ...(JSON.parse(stored) as Partial<typeof fallback>) };
    } catch {
      return fallback;
    }
  });
  const senseiOpen = panels.sensei;

  const togglePanel = useCallback((name: 'learning' | 'diagram' | 'sensei') => {
    setPanels((current) => {
      const next = { ...current, [name]: !current[name] };
      localStorage.setItem('jojo_panels', JSON.stringify(next));
      return next;
    });
  }, []);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.key === '/' ? 'sensei' : e.key === '1' ? 'learning' : e.key === '2' ? 'diagram' : null;
      if (!target) return;
      e.preventDefault();
      togglePanel(target);
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [togglePanel]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('jojo-theme', theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  }

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [settings, setSettings] = useState<AppSettings>({ focusMinutes: 120 });
  const [code, setCode] = useState('');

  const [output, setOutput] = useState<RunResult | null>(null);
  const [testResults, setTestResults] = useState<TestOutcome[]>([]);
  const [running, setRunning] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [senseiBusy, setSenseiBusy] = useState(false);
  const [stuckCount, setStuckCount] = useState(0);
  const [senseiEnabled, setSenseiEnabled] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState(1);
  const [selectedCheatId, setSelectedCheatId] = useState(cheatSections[0]?.id || '');
  const [lastIdleCode, setLastIdleCode] = useState('');
  const [assignment, setAssignment] = useState<QuestionAssignment | null>(null);
  const [compileCount, setCompileCount] = useState(0);

  // Classroom Room State
  const [showRoomModal, setShowRoomModal] = useState(false);
  const [activeRoom, setActiveRoom] = useState<RoomInfo | null>(null);

  const selectedQuestion = useMemo(
    () => practiceQuestions.find((question) => question.id === selectedQuestionId) || practiceQuestions[0],
    [selectedQuestionId],
  );

  useEffect(() => {
    void bootstrap();
  }, []);

  useEffect(() => {
    const triggerFullscreen = () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    };
    triggerFullscreen();
    window.addEventListener('click', triggerFullscreen, { once: true });
    window.addEventListener('keydown', triggerFullscreen, { once: true });
    return () => {
      window.removeEventListener('click', triggerFullscreen);
      window.removeEventListener('keydown', triggerFullscreen);
    };
  }, []);

  useEffect(() => {
    if (!user || user.role !== 'student') return;
    void pickAssignedQuestion(false);
    void checkActiveRoom();
  }, [user]);

  async function checkActiveRoom() {
    try {
      const res = await getActiveRoom();
      if (res.room) {
        setActiveRoom(res.room);
      } else {
        setShowRoomModal(true);
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!senseiEnabled || senseiBusy || code === lastIdleCode || code.trim().length < 12) return;
    const timeout = window.setTimeout(() => {
      void handleIdleAnalysis();
      setLastIdleCode(code);
    }, 3000);
    return () => window.clearTimeout(timeout);
  }, [code, lastIdleCode, selectedQuestion, senseiBusy, senseiEnabled]);

  async function bootstrap() {
    try {
      const [{ user: currentUser }, settingsResponse] = await Promise.all([me(), getSettings()]);
      setUser(currentUser);
      setSettings(settingsResponse.settings);
    } catch {
      setUser(null);
    } finally {
      setAuthChecked(true);
    }
  }

  async function handleRun(stdin: string) {
    setRunning(true);
    try {
      const result = await runAssignedC(code, stdin, assignment?.id, selectedQuestion.id);
      setOutput(result);
      setCompileCount((current) => current + 1);
      if (assignment) {
        setAssignment(null);
      }
    } catch (error) {
      setOutput({ message: error instanceof Error ? error.message : 'Run failed.' });
    } finally {
      setRunning(false);
    }
  }

  async function handleSubmitQuestion() {
    setSubmitting(true);
    try {
      const result = await submitQuestion(selectedQuestion.id, code);
      setTestResults(result.results || []);
      // Failing the hidden tests is a normal outcome, not an error: stay on the
      // question and let the student see which cases did not match.
      if (result.results?.length && !result.passed) return;
      // Leave the passing results on screen -- clearing them here meant a
      // correct answer flashed past with no confirmation that it was checked.
      setOutput(null);
      await pickAssignedQuestion(true, selectedQuestion.id);
    } catch (error) {
      setTestResults([]);
      setOutput({ message: error instanceof Error ? error.message : 'Submission failed.' });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleIdleAnalysis() {
    setSenseiBusy(true);
    try {
      const response = await analyzeIdleCode({
        code,
        assignmentId: assignment?.id,
        questionId: selectedQuestion.id,
        questionTitle: selectedQuestion.title,
        answer: selectedQuestion.answer,
      });
      setMessages((current) => [...current, { role: 'assistant', content: response.text }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Sensei is unavailable.' }]);
    } finally {
      setSenseiBusy(false);
    }
  }

  async function pickAssignedQuestion(forceNext: boolean, afterQuestionId?: number) {
    try {
      const response = await assignQuestion(
        practiceQuestions.map(({ id, title, explanation }) => ({ id, title, explanation })),
        forceNext,
        afterQuestionId,
      );
      setAssignment(response.assignment);
      setSelectedQuestionId(response.assignment.questionId);
    } catch {
      const picked = practiceQuestions[0];
      setAssignment({ id: 'local', questionId: picked.id, title: picked.title, explanation: picked.explanation });
      setSelectedQuestionId(picked.id);
    }
  }

  async function handleSend(message = draft, silentUserMessage = false) {
    if (!message.trim()) return;
    const visibleMessage = silentUserMessage ? `I paused on Q${selectedQuestion.id}. What should I do next?` : message;
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content: visibleMessage }];
    setMessages(nextMessages);
    setDraft('');
    setSenseiBusy(true);
    try {
      const response = await askSensei(message, buildSenseiContext(), messages);
      setMessages([...nextMessages, { role: 'assistant', content: response.text }]);
    } catch (error) {
      setMessages([...nextMessages, { role: 'assistant', content: error instanceof Error ? error.message : 'Sensei is unavailable.' }]);
    } finally {
      setSenseiBusy(false);
    }
  }

  async function handleExplain() {
    setSenseiBusy(true);
    try {
      const response = await explainCode(`Question: Q${selectedQuestion.id}. ${selectedQuestion.title}\n\nStudent code:\n${code}`);
      setMessages((current) => [...current, { role: 'assistant', content: response.text }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Sensei is unavailable.' }]);
    } finally {
      setSenseiBusy(false);
    }
  }

  async function handleHint() {
    const nextCount = stuckCount + 1;
    setStuckCount(nextCount);
    setSenseiBusy(true);
    try {
      const response = await stuckHelp(buildSenseiContext(), code.slice(0, code.length).split('\n').length, nextCount);
      setMessages((current) => [...current, { role: 'assistant', content: response.text }]);
    } catch (error) {
      setMessages((current) => [...current, { role: 'assistant', content: error instanceof Error ? error.message : 'Sensei is unavailable.' }]);
    } finally {
      setSenseiBusy(false);
    }
  }

  function buildSenseiContext(): string {
    return `Practice question: Q${selectedQuestion.id}. ${selectedQuestion.title}
Explanation:
${selectedQuestion.explanation || 'No explanation provided.'}

Reference answer for Sensei only:
${selectedQuestion.answer || 'No reference answer available.'}

Student code:
${code}

Guide the student toward the next small edit. Do not reveal the full reference answer unless they explicitly ask for the answer.`;
  }

  if (!authChecked) {
    return (
      <>
        <Header theme={theme} onThemeToggle={toggleTheme} />
        <main className="auth-shell">Loading Jojo...</main>
        <Footer />
      </>
    );
  }

  if (!user) {
    return (
      <>
        <Header theme={theme} onThemeToggle={toggleTheme} />
        <AuthScreen
          onAuthed={(nextUser) => {
            setUser(nextUser);
            void getSettings().then((response) => setSettings(response.settings));
          }}
        />
        <Footer />
      </>
    );
  }

  if (user.role === 'manager') {
    return (
      <ManagerDashboard
        username={user.username}
        onLogout={() => {
          logout();
          setUser(null);
        }}
      />
    );
  }

  if (user.role === 'admin') {
    return (
      <>
        <Header theme={theme} onThemeToggle={toggleTheme} />
        <AdminManagerScreen
          user={user}
          settings={settings}
          onSettingsChange={setSettings}
          onLogout={() => {
            logout();
            setUser(null);
          }}
        />
      </>
    );
  }

  return (
    <>
      <Header 
        theme={theme} 
        onThemeToggle={toggleTheme}
        senseiOpen={panels.sensei}
        onSenseiToggle={() => togglePanel('sensei')}
        learningOpen={panels.learning}
        onLearningToggle={() => togglePanel('learning')}
        diagramOpen={panels.diagram}
        onDiagramToggle={() => togglePanel('diagram')}
        activeRoom={activeRoom}
        onJoinRoom={() => setShowRoomModal(true)}
        onLeaveRoom={async () => {
          try {
            await leaveRoom();
            setActiveRoom(null);
          } catch {
            // ignore
          }
        }}
      />

      {showRoomModal && (
        <RoomLandingModal
          activeRoom={activeRoom}
          onJoinSuccess={(room) => {
            setActiveRoom(room);
            setShowRoomModal(false);
          }}
          onDirectAccess={() => {
            setShowRoomModal(false);
          }}
          onClose={() => setShowRoomModal(false)}
          onLeaveRoom={async () => {
            await leaveRoom();
            setActiveRoom(null);
          }}
        />
      )}

      <main
        className={[
          'app-shell',
          panels.learning ? '' : 'hide-learning',
          panels.diagram ? '' : 'hide-diagram',
          panels.sensei ? '' : 'hide-sensei',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <LearningPanel
          questions={practiceQuestions}
          selectedQuestion={selectedQuestion}
          cheatSections={cheatSections}
          selectedCheatId={selectedCheatId}
          onQuestionChange={(id) => {
            setAssignment(null);
            setSelectedQuestionId(id);
            setOutput(null);
            setTestResults([]);
          }}
          onCheatChange={setSelectedCheatId}
        />
        <EditorPanel
          code={code}
          output={output}
          testResults={testResults}
          running={running}
          submitting={submitting}
          onCodeChange={setCode}
          onRunWithInput={handleRun}
          onSubmit={handleSubmitQuestion}
          onExplain={handleExplain}
          compileCount={compileCount}
          focusMinutes={settings.focusMinutes}
          username={user.username}
          onLogout={() => {
            logout();
            setUser(null);
          }}
        />
        <DiagramPanel code={code} theme={theme} />
        <SenseiPanel
          messages={messages}
          draft={draft}
          busy={senseiBusy}
          enabled={senseiEnabled}
          onEnabledChange={setSenseiEnabled}
          onDraftChange={setDraft}
          onSend={() => handleSend()}
          onHint={handleHint}
        />
      </main>
      <Footer />
    </>
  );
}

function AuthScreen({ onAuthed }: { onAuthed: (user: AuthUser) => void }) {
  const [mode, setMode] = useState<'register' | 'student' | 'admin' | 'manager'>('student');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    try {
      const response =
        mode === 'register'
          ? await register(username, email, password)
          : await login(username || email, password, mode === 'student' ? 'student' : mode);
      onAuthed(response.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    }
  }

  return (
    <main className="auth-shell">
      <form className="auth-card" onSubmit={submit}>
        <p className="eyebrow">Jojo Access</p>
        <h1>{mode === 'register' ? 'Register student' : `${mode[0].toUpperCase()}${mode.slice(1)} login`}</h1>
        <div className="segmented">
          {(['student', 'register', 'manager', 'admin'] as const).map((item) => (
            <button type="button" className={mode === item ? 'active' : ''} onClick={() => setMode(item)} key={item}>
              {item}
            </button>
          ))}
        </div>
        <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="Username or email" />
        {mode === 'register' ? <input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="Email" /> : null}
        <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" type="password" />
        {error ? <p className="form-error">{error}</p> : null}
        <button className="run-button">{mode === 'register' ? 'Register' : 'Login'}</button>
      </form>
    </main>
  );
}

function AdminManagerScreen({
  user,
  settings,
  onSettingsChange,
  onLogout,
}: {
  user: AuthUser;
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onLogout: () => void;
}) {
  const [focusMinutes, setFocusMinutes] = useState(settings.focusMinutes);
  const [students, setStudents] = useState<StudentProgress[]>([]);
  const [manager, setManager] = useState({ username: '', email: '', password: '' });
  const [notice, setNotice] = useState('');

  useEffect(() => {
    void getProgress().then((response) => setStudents(response.students));
  }, []);

  async function saveSettings() {
    const response = await updateSettings(focusMinutes);
    onSettingsChange(response.settings);
    setNotice('Settings updated for all students.');
  }

  async function createManager(event: FormEvent) {
    event.preventDefault();
    const response = await addManager(manager.username, manager.email, manager.password);
    setNotice(`Manager ${response.manager.username} added.`);
    setManager({ username: '', email: '', password: '' });
  }

  return (
    <main className="admin-shell">
      <section className="admin-topbar">
        <div>
          <p className="eyebrow">{user.role}</p>
          <h1>Student progress</h1>
        </div>
        <button className="icon-text-button" onClick={onLogout}>
          Logout
        </button>
      </section>
      <section className="settings-panel">
        <label>
          Focus timer, minutes
          <input type="number" min={1} max={240} value={focusMinutes} onChange={(event) => setFocusMinutes(Number(event.target.value))} />
        </label>
        <button className="run-button" onClick={saveSettings}>
          Save
        </button>
        {notice ? <span className="notice">{notice}</span> : null}
      </section>
      {user.role === 'admin' ? (
        <form className="settings-panel" onSubmit={createManager}>
          <input value={manager.username} onChange={(event) => setManager({ ...manager, username: event.target.value })} placeholder="Manager username" />
          <input value={manager.email} onChange={(event) => setManager({ ...manager, email: event.target.value })} placeholder="Manager email" />
          <input
            value={manager.password}
            onChange={(event) => setManager({ ...manager, password: event.target.value })}
            placeholder="Manager password"
            type="password"
          />
          <button className="run-button">Add manager</button>
        </form>
      ) : null}
      <section className="progress-table">
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Email</th>
              <th>Compiled</th>
              <th>Succeeded</th>
              <th>Last compile</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id}>
                <td>{student.username}</td>
                <td>{student.email}</td>
                <td>{student.compileCount}</td>
                <td>{student.successCount}</td>
                <td>{student.lastCompileAt ? new Date(student.lastCompileAt).toLocaleString() : 'Never'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
