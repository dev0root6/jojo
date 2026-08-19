import { useEffect, useMemo, useRef } from 'react';
import mermaid from 'mermaid';
import { analyzeC, findCRelationships, generateMermaid } from '../lib/cAnalysis';

interface DiagramPanelProps {
  code: string;
  theme?: 'light' | 'dark';
}

const SANDBOX_ID = 'jojo-mermaid-sandbox';

/**
 * A parked, zero-sized node for mermaid to measure in. Kept out of the flow so
 * a re-render cannot change the page height.
 */
function measuringSandbox(): HTMLElement {
  const existing = document.getElementById(SANDBOX_ID);
  if (existing) return existing;
  const node = document.createElement('div');
  node.id = SANDBOX_ID;
  node.setAttribute('aria-hidden', 'true');
  node.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden;visibility:hidden';
  document.body.appendChild(node);
  return node;
}

export default function DiagramPanel({ code, theme = 'light' }: DiagramPanelProps) {
  const diagramRef = useRef<HTMLDivElement | null>(null);
  const mermaidText = useMemo(() => generateMermaid(code), [code]);
  const analysis = useMemo(() => analyzeC(code), [code]);
  const relationships = useMemo(() => findCRelationships(code), [code]);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'base',
      themeVariables: theme === 'dark' ? {
        background: '#101521',
        primaryColor: '#222d45',
        primaryTextColor: '#e0e7f5',
        primaryBorderColor: '#4f75f5',
        lineColor: '#7c8fa8',
        edgeLabelBackground: '#101521',
        secondaryColor: '#1c281e',
        tertiaryColor: '#2a4224',
        fontFamily: 'Inter, ui-sans-serif, system-ui',
      } : {
        background: '#f7f8fb',
        primaryColor: '#e7f0ff',
        primaryTextColor: '#172033',
        primaryBorderColor: '#5472d3',
        lineColor: '#6f7787',
        edgeLabelBackground: '#f7f8fb',
        secondaryColor: '#eef6ed',
        tertiaryColor: '#fff4d8',
        fontFamily: 'Inter, ui-sans-serif, system-ui',
      },
    });

    let cancelled = false;
    async function render() {
      if (!diagramRef.current) return;
      try {
        const id = `jojo-diagram-${Math.random().toString(36).slice(2)}`;
        // Render into an off-screen node we own. Given no container, mermaid
        // measures inside document.body, which grows the page and flashes a
        // scrollbar on every keystroke.
        const result = await mermaid.render(id, mermaidText, measuringSandbox());
        if (!cancelled && diagramRef.current) diagramRef.current.innerHTML = result.svg;
      } catch {
        if (!cancelled && diagramRef.current) {
          diagramRef.current.innerHTML = '<p class="mermaid-empty">Diagram is waiting for complete C syntax.</p>';
        }
      }
    }
    const timeout = window.setTimeout(render, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [mermaidText, theme]);

  return (
    <section className="diagram-panel" aria-label="Live code diagram">
      <div className="panel-header">
        <div>
          <p className="eyebrow">Live Code-to-Diagram</p>
          <h2>Control and calls</h2>
        </div>
        <div className="metric-row">
          <span>{analysis.metrics.functions} funcs</span>
          <span>CC {analysis.metrics.complexity}</span>
          <span>Depth {analysis.metrics.maxNestingDepth}</span>
        </div>
      </div>
      <div ref={diagramRef} className="mermaid-stage" />
      <div className="relationship-list">
        <div className="mini-heading">Visualizer</div>
        {relationships.length === 0 ? (
          <p className="muted">Define a variable or function, then use it later to see relationships.</p>
        ) : (
          relationships.slice(0, 8).map((relationship) => (
            <div className="relationship" key={relationship.id}>
              <strong>{relationship.name}</strong>
              <span>
                line {relationship.fromLine} to line {relationship.toLine}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
