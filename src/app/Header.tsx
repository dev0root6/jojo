import atriaLogo from '../assets/logos/aitlogo.png';
import iseLogoLight from '../assets/logos/new_ise.png';
import iseLogoDark from '../assets/logos/ise-untitled.png';
import { Sun, Moon, Lightbulb, LogIn, LogOut, Users, ListChecks, Network } from 'lucide-react';
import type { RoomInfo } from './api';
import JojoMark from './JojoMark';

interface HeaderProps {
  theme?: 'light' | 'dark';
  onThemeToggle?: () => void;
  senseiOpen?: boolean;
  onSenseiToggle?: () => void;
  learningOpen?: boolean;
  onLearningToggle?: () => void;
  diagramOpen?: boolean;
  onDiagramToggle?: () => void;
  activeRoom?: RoomInfo | null;
  onJoinRoom?: () => void;
  onLeaveRoom?: () => void;
}

export default function Header({
  theme = 'light',
  onThemeToggle,
  senseiOpen = true,
  onSenseiToggle,
  learningOpen = true,
  onLearningToggle,
  diagramOpen = true,
  onDiagramToggle,
  activeRoom,
  onJoinRoom,
  onLeaveRoom,
}: HeaderProps) {
  return (
    <header className="global-header">
      <div className="logos">
        <img src={atriaLogo} alt="ATRIA Logo" className="logo" />
        <img src={theme === 'dark' ? iseLogoDark : iseLogoLight} alt="ISE Logo" className="logo" />
      </div>
      <span className="header-brand">
        <JojoMark size={22} title="JoJo" />
        <span className="header-wordmark">JoJo</span>
      </span>

      <div style={{ flex: 1 }} />

      {activeRoom ? (
        <div className="header-room-info">
          <div className="header-room-badge" title={`Joined Room: ${activeRoom.name} (${activeRoom.roomCode})`}>
            <Users size={15} />
            <span className="header-room-name">{activeRoom.name}</span>
            <span className="header-room-code">{activeRoom.roomCode}</span>
          </div>
          {onLeaveRoom && (
            <button
              className="header-room-btn leave"
              onClick={onLeaveRoom}
              aria-label="Leave room"
              title="Leave Room"
            >
              <LogOut size={15} />
              <span>Leave Room</span>
            </button>
          )}
        </div>
      ) : (
        onJoinRoom && (
          <button
            className="header-room-btn join"
            onClick={onJoinRoom}
            aria-label="Join room"
            title="Join Classroom Room"
          >
            <LogIn size={15} />
            <span>Join Room</span>
          </button>
        )
      )}

      {onThemeToggle && (
        <button className="icon-button" onClick={onThemeToggle} aria-label="Toggle theme">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
        </button>
      )}
      <div className="panel-toggles" role="group" aria-label="Show or hide panels">
        {onLearningToggle && (
          <button
            className={'panel-toggle' + (learningOpen ? ' is-on' : '')}
            onClick={onLearningToggle}
            aria-pressed={learningOpen}
            aria-label="Toggle questions panel"
            title="Questions panel (Ctrl+1)"
          >
            <ListChecks size={17} />
          </button>
        )}
        {onDiagramToggle && (
          <button
            className={'panel-toggle' + (diagramOpen ? ' is-on' : '')}
            onClick={onDiagramToggle}
            aria-pressed={diagramOpen}
            aria-label="Toggle diagram panel"
            title="Diagram panel (Ctrl+2)"
          >
            <Network size={17} />
          </button>
        )}
        {onSenseiToggle && (
          <button
            className={'panel-toggle' + (senseiOpen ? ' is-on' : '')}
            onClick={onSenseiToggle}
            aria-pressed={senseiOpen}
            aria-label="Toggle Sensei panel"
            title="Sensei panel (Ctrl+/)"
          >
            <Lightbulb size={17} />
          </button>
        )}
      </div>
    </header>
  );
}

