import { useMemo, useState } from 'react';
import { CheckCircle, Play, Sparkles } from 'lucide-react';
import type { RunResult, TestOutcome } from './api';
import { cleanStderr, describeRuntimeIssue, parseDiagnostics, type Diagnostic } from '../lib/diagnostics';
import CodeEditor from './CodeEditor';

interface EditorPanelProps {
  code: string;
  output: RunResult | null;
  testResults?: TestOutcome[];
  running: boolean;
  onCodeChange: (code: string) => void;
  onRunWithInput: (stdin: string) => void;
  onSubmit: () => void;
  submitting?: boolean;
  onExplain: () => void;
  compileCount: number;
  focusMinutes: number;
  username: string;
  onLogout: () => void;
}

export default function EditorPanel({
  code,
  output,
  testResults = [],
  running,
  onCodeChange,
  onRunWithInput,
  onSubmit,
  submitting,
  onExplain,
  compileCount,
  focusMinutes,
  username,
  onLogout,
}: EditorPanelProps) {
  const [inputText, setInputText] = useState('');
  const [waitingForInput, setWaitingForInput] = useState(false);
  const [compiledCode, setCompiledCode] = useState<string | null>(null);

  function handleRunClick() {
    setCompiledCode(code);
    if (waitingForInput) {
      // User already typed input, now execute
      onRunWithInput(inputText);
      setWaitingForInput(false);
    } else {
      // First click: check if code has scanf/gets — prompt for input
      const needsInput = /\b(scanf|gets|fgets|getchar|fgetc|getline)\s*\(/.test(code);
      if (needsInput) {
        setWaitingForInput(true);
      } else {
        onRunWithInput('');
      }
    }
  }

  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && e.ctrlKey) {
      setCompiledCode(code);
      onRunWithInput(inputText);
      setWaitingForInput(false);
    }
  }

  const hasCompiledCurrentCode = Boolean(compiledCode !== null && compiledCode === code);

  // Line markers come from the last compile, so they are only meaningful while
  // the buffer still matches the code that produced them.
  const flagged = useMemo(() => {
    const buildFailure = testResults.find((item) => item.compileOutput);
    const raw = buildFailure
      ? [buildFailure.compileOutput, cleanStderr(buildFailure.stderr)]
      : [output?.compile_output, cleanStderr(output?.stderr)];
    const diagnostics = parseDiagnostics(raw.filter(Boolean).join('\n'));
    const errors = new Set<number>();
    const warnings = new Set<number>();
    for (const item of diagnostics) {
      if (item.line === undefined) continue;
      if (item.severity === 'error') errors.add(item.line);
      else if (item.severity === 'warning') warnings.add(item.line);
    }
    return { errors, warnings };
  }, [output, testResults]);

  const showMarkers = hasCompiledCurrentCode || testResults.length > 0;

  // Status 3 means it built and exited cleanly. A leftover warning (an unused
  // variable, say) should not block submitting — missing headers and other real
  // mistakes are compile errors now, so they never reach status 3.
  const isSuccess = Boolean(hasCompiledCurrentCode && output && output.status?.id === 3);

  const canSubmit = !running && !submitting && Boolean(code.trim()) && isSuccess;
  const submitTitle = !hasCompiledCurrentCode
    ? "You must compile and run your current code before submitting"
    : !isSuccess
    ? "Execute code successfully without errors before submitting"
    : "Submit answer and proceed to next question";

  return (
    <section className="editor-panel" aria-label="C editor">
      <div className="toolbar">
        <div>
          <p className="eyebrow">Jojo C IDE</p>
          <h1>Learn C by running it</h1>
          <div className="student-meta">
            <span>{username}</span>
            <span>{compileCount} compiles</span>
            <span>{focusMinutes} min focus</span>
          </div>
        </div>
        <div className="toolbar-actions">
          <button className="icon-button" onClick={onExplain} title="Ask Sensei to explain this code" aria-label="Ask Sensei to explain this code">
            <Sparkles size={18} />
          </button>
          <button className="run-button" onClick={handleRunClick} disabled={running || submitting}>
            <Play size={18} />
            {running ? 'Running...' : waitingForInput ? 'Execute' : 'Run'}
          </button>
          <button
            className="run-button"
            onClick={onSubmit}
            disabled={!canSubmit}
            style={{
              backgroundColor: canSubmit ? 'var(--success-color, #10b981)' : '#64748b',
              color: '#ffffff',
              opacity: canSubmit ? 1 : 0.6,
              cursor: canSubmit ? 'pointer' : 'not-allowed',
            }}
            title={submitTitle}
          >
            <CheckCircle size={18} />
            {submitting ? 'Submitting...' : 'Submit & Next'}
          </button>
          <button className="icon-text-button" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>
      <CodeEditor
        value={code}
        onChange={onCodeChange}
        errorLines={showMarkers ? flagged.errors : undefined}
        warningLines={showMarkers ? flagged.warnings : undefined}
      />
      <div className="output-panel">
        <div className="output-panel-header">
          <span>{testResults.length > 0 ? 'Test Results' : 'Output'}</span>
        </div>
        <div className="output-panel-body">
          {waitingForInput ? (
            <>
              <div className="output-input-prompt">
                Program requires input. Type values below (one per line), then click <strong>Execute</strong> or press <kbd>Ctrl+Enter</kbd>:
              </div>
              <textarea
                className="output-input-area"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleInputKeyDown}
                placeholder={"e.g.\n10\n+\n5"}
                autoFocus
              />
            </>
          ) : running ? (
            <pre className="output-panel-text" aria-live="polite">
              {'Compiling & running...\n'}
            </pre>
          ) : testResults.length > 0 ? (
            <TestResultsView results={testResults} />
          ) : (
            <OutputView output={output} />
          )}
        </div>
      </div>
    </section>
  );
}

function OutputView({ output }: { output: RunResult | null }) {
  if (!output) return <div className="output-panel-text" aria-live="polite" />;

  const stderr = cleanStderr(output.stderr);
  const diagnostics = parseDiagnostics([output.compile_output, stderr].filter(Boolean).join('\n'));
  const errors = diagnostics.filter((item) => item.severity === 'error');
  const warnings = diagnostics.filter((item) => item.severity === 'warning');
  const runtime = describeRuntimeIssue(output.status?.id, output.status?.description, output.stderr);
  const isSuccess = output.status?.id === 3;
  // Only fall back to the raw compiler dump when nothing could be parsed out of it.
  const unparsed = diagnostics.length === 0 && !runtime ? [output.compile_output, stderr].filter(Boolean).join('\n') : '';

  return (
    <div className="output-panel-text" aria-live="polite">
      {output.stdout ? <pre className="output-stdout">{output.stdout}</pre> : null}

      {errors.length > 0 ? (
        <div className="diagnostic-group">
          <div className="diagnostic-heading is-error">
            {errors.length === 1 ? '1 error' : errors.length + ' errors'} — fix these before running
          </div>
          {errors.map((item, index) => (
            <DiagnosticRow key={'error-' + index} diagnostic={item} />
          ))}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <div className="diagnostic-group">
          <div className="diagnostic-heading is-warning">
            {warnings.length === 1 ? '1 warning' : warnings.length + ' warnings'}
          </div>
          {warnings.map((item, index) => (
            <DiagnosticRow key={'warning-' + index} diagnostic={item} />
          ))}
        </div>
      ) : null}

      {runtime ? (
        <div className="diagnostic-group">
          <div className="diagnostic-heading is-error">{runtime.title}</div>
          {runtime.hint ? <p className="diagnostic-hint">{runtime.hint}</p> : null}
          {stderr && diagnostics.length === 0 ? <pre className="diagnostic-snippet">{stderr}</pre> : null}
        </div>
      ) : null}

      {unparsed ? <pre className="output-stdout">{unparsed}</pre> : null}
      {output.message ? <pre className="output-stdout">{output.message}</pre> : null}

      {isSuccess ? (
        <div className="diagnostic-success">
          === Code Execution Successful ==={output.time ? '  (' + output.time + 's)' : ''}
        </div>
      ) : null}
    </div>
  );
}

function DiagnosticRow({ diagnostic }: { diagnostic: Diagnostic }) {
  const location =
    diagnostic.line === undefined
      ? 'Linker'
      : 'Line ' + diagnostic.line + (diagnostic.column === undefined ? '' : ', Col ' + diagnostic.column);

  return (
    <div className="diagnostic-row">
      <div className="diagnostic-location">{location}</div>
      <div className="diagnostic-body">
        <span className={'diagnostic-severity is-' + diagnostic.severity}>{diagnostic.severity}</span>
        <span className="diagnostic-message">{diagnostic.message}</span>
        {diagnostic.snippet.length > 0 ? <pre className="diagnostic-snippet">{diagnostic.snippet.join('\n')}</pre> : null}
        {diagnostic.notes.map((note, index) => (
          <p key={'note-' + index} className="diagnostic-note">
            Fix: {note}
          </p>
        ))}
      </div>
    </div>
  );
}

function TestResultsView({ results }: { results: TestOutcome[] }) {
  const passed = results.filter((item) => item.passed).length;
  const allPassed = passed === results.length;
  // A build failure breaks every case in exactly the same way, so report the
  // compiler once rather than repeating it per case.
  const buildFailure = results.length > 0 && results.every((item) => item.compileOutput);

  if (buildFailure) {
    return (
      <div className="output-panel-text" aria-live="polite">
        <div className="test-summary is-fail">Your code did not compile, so the test cases could not run.</div>
        <OutputView output={{ compile_output: results[0].compileOutput, stderr: results[0].stderr, status: { id: 6, description: 'Compilation Error' } }} />
      </div>
    );
  }

  return (
    <div className="output-panel-text" aria-live="polite">
      <div className={'test-summary ' + (allPassed ? 'is-pass' : 'is-fail')}>
        {allPassed
          ? `All ${results.length} test cases passed — answer accepted.`
          : `${passed} of ${results.length} test cases passed — fix the failing ones and submit again.`}
      </div>
      {results.map((item, index) => (
        <TestRow key={index} result={item} index={index} />
      ))}
    </div>
  );
}

function TestFailureDetail({ result }: { result: TestOutcome }) {
  // When the program never built, comparing expected against actual output is
  // noise — the compiler message is the only thing worth showing.
  const build = parseDiagnostics([result.compileOutput, cleanStderr(result.stderr)].filter(Boolean).join('\n'));
  if (build.length > 0) {
    return (
      <div className="test-detail">
        {build.map((item, index) => (
          <DiagnosticRow key={'build-' + index} diagnostic={item} />
        ))}
      </div>
    );
  }

  return (
    <div className="test-detail">
      <div className="test-field">
        <span className="test-field-key">Input</span>
        <span className="test-field-value">{result.stdin ? result.stdin : '(no input)'}</span>
      </div>
      <div className="test-field">
        <span className="test-field-key">Expected</span>
        <span className="test-field-value">{result.expected || '(no output)'}</span>
      </div>
      <div className="test-field">
        <span className="test-field-key">Your output</span>
        <span className="test-field-value">{result.actual.trim() || '(nothing)'}</span>
      </div>
      <p className="test-reason">{result.reason}</p>
    </div>
  );
}

function TestRow({ result, index }: { result: TestOutcome; index: number }) {
  return (
    <div className={'test-row ' + (result.passed ? 'is-pass' : 'is-fail')}>
      <div className="test-row-head">
        <span className={'test-badge ' + (result.passed ? 'is-pass' : 'is-fail')}>{result.passed ? 'PASS' : 'FAIL'}</span>
        <span className="test-label">
          Case {index + 1}: {result.label}
        </span>
      </div>
      {result.passed ? null : <TestFailureDetail result={result} />}
    </div>
  );
}
