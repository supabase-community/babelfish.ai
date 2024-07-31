import { LANGUAGES } from '../utils/languages';

export default function LanguageSelector({ type, onChange, defaultLanguage }) {
  return (
    <div className="language-selector">
      <label className="text-l font-semibold">{type}: </label>
      <select onChange={onChange} defaultValue={defaultLanguage}>
        {Object.entries(LANGUAGES).map(([key, value]) => {
          return (
            <option key={key} value={value}>
              {key}
            </option>
          );
        })}
      </select>
    </div>
  );
}
