import { useTheme } from '../context/ThemeContext.jsx';
import Icon from './Icon.jsx';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className="nl-icon-btn" onClick={toggle} aria-label={`Switch to ${next} theme`}>
      <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
    </button>
  );
}
