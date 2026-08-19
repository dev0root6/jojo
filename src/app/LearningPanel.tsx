import { BookOpen, CheckCircle2, ListChecks, ChevronRight, ChevronLeft } from 'lucide-react';
import type { CheatSection, PracticeQuestion } from './learningContent';

interface LearningPanelProps {
  questions: PracticeQuestion[];
  selectedQuestion: PracticeQuestion;
  cheatSections: CheatSection[];
  selectedCheatId: string;
  onQuestionChange: (id: number) => void;
  onCheatChange: (id: string) => void;
}

export default function LearningPanel({
  questions,
  selectedQuestion,
  cheatSections,
  selectedCheatId,
  onQuestionChange,
  onCheatChange,
}: LearningPanelProps) {
  const selectedCheat = cheatSections.find((section) => section.id === selectedCheatId) || cheatSections[0];

  return (
    <section className="learning-panel" aria-label="Practice and cheatsheet">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Sequential Practice</p>
          <h2>Question {selectedQuestion.id} of {questions.length}</h2>
        </div>
        <ListChecks size={20} />
      </div>
      <div className="question-picker">
        {/* The picker gets its own row: sharing one with Prev and Next left it
            about 130px on a narrow panel, enough for "Q1. Print a…". */}
        <select
          className="question-select"
          aria-label="Choose a question"
          value={selectedQuestion.id}
          onChange={(event) => onQuestionChange(Number(event.target.value))}
        >
          {questions.map((question) => (
            <option key={question.id} value={question.id}>
              Q{question.id}. {question.title}
            </option>
          ))}
        </select>
        <div className="sequential-controls">
          <button
            className="icon-text-button"
            type="button"
            disabled={selectedQuestion.id <= 1}
            onClick={() => onQuestionChange(selectedQuestion.id - 1)}
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <button
            className="icon-text-button"
            type="button"
            disabled={selectedQuestion.id >= questions.length}
            onClick={() => onQuestionChange(selectedQuestion.id + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
        <div className="question-card">
          <strong>
            Q{selectedQuestion.id}. {selectedQuestion.title}
          </strong>
          <p>{selectedQuestion.explanation || 'Write the code yourself first. Run it to verify, then click Submit to record completion and proceed to next question.'}</p>
        </div>
      </div>
      <div className="cheatsheet">
        <div className="mini-heading with-icon">
          <BookOpen size={15} />
          CheatSheet
        </div>
        {selectedCheat ? (
          <>
            <div className="cheat-toc" aria-label="CheatSheet table of contents">
              <table>
                <thead>
                  <tr>
                    <th>Section</th>
                    <th>Topic</th>
                  </tr>
                </thead>
                <tbody>
                  {cheatSections.map((section, index) => (
                    <tr key={section.id} className={section.id === selectedCheat.id ? 'active' : ''}>
                      <td>{index + 1}</td>
                      <td>
                        <button type="button" onClick={() => onCheatChange(section.id)}>
                          {section.title}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="cheat-content">
              <div className="mini-heading with-icon">
                <CheckCircle2 size={15} />
                {selectedCheat.title}
              </div>
              <MarkdownLite markdown={selectedCheat.body} />
            </div>
          </>
        ) : (
          <div className="cheat-empty">No CheatSheet sections found.</div>
        )}
      </div>
    </section>
  );
}

function MarkdownLite({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/(```[\s\S]*?```)/g);

  return (
    <div className="cheat-body">
      {blocks.map((block, blockIndex) => {
        if (!block) return null;
        if (block.startsWith('```')) {
          const lines = block.split('\n');
          const code = lines.slice(1, lines.length - 1).join('\n');
          return (
            <pre className="cheat-code" key={blockIndex}>
              <code>{code}</code>
            </pre>
          );
        }

        return <div key={blockIndex}>{parseMarkdownText(block)}</div>;
      })}
    </div>
  );
}

function parseMarkdownText(text: string): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // Check if table row (starts and ends with '|')
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 1) {
        const headerRow = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim());

        const hasDivider = tableLines.length > 1 && tableLines[1].includes('---');
        const bodyLines = hasDivider ? tableLines.slice(2) : tableLines.slice(1);

        result.push(
          <div key={`table-${i}`} style={{ overflowX: 'auto', margin: '8px 0' }}>
            <table className="cheat-markdown-table">
              <thead>
                <tr>
                  {headerRow.map((cell, idx) => (
                    <th key={idx}>{renderInlineMarkdown(cell)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {bodyLines.map((rowStr, rowIdx) => {
                  const cells = rowStr
                    .split('|')
                    .slice(1, -1)
                    .map((c) => c.trim());
                  return (
                    <tr key={rowIdx}>
                      {cells.map((cell, cellIdx) => (
                        <td key={cellIdx}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>,
        );
        continue;
      }
    }

    // Regular line / paragraph
    result.push(
      <p key={`line-${i}`} className="cheat-line">
        {renderInlineMarkdown(line)}
      </p>,
    );
    i++;
  }

  return result;
}

function renderInlineMarkdown(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code key={index} className="cheat-inline-code">
          {part.slice(1, -1)}
        </code>
      );
    }
    return part;
  });
}

