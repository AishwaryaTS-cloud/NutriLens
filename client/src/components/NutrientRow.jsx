import { useId } from 'react';
import ChoiceGroup from './ChoiceGroup.jsx';
import Icon from './Icon.jsx';

const GOAL_OPTIONS = [
  { value: 'lower', label: 'Lower is better' },
  { value: 'higher', label: 'Higher is better' },
];

/** One nutrient: tick it to include it, then choose a goal and how much it matters. */
export default function NutrientRow({ nutrient, state, weights, error, onSelect, onField }) {
  const id = useId();
  const weightOptions = [];
  for (let weight = weights.min; weight <= weights.max; weight += 1) {
    weightOptions.push({ value: weight, label: String(weight) });
  }

  return (
    <div className={`nutrient-row${state.selected ? ' is-selected' : ''}`} data-invalid={error ? 'true' : undefined}>
      <label className="nl-check" htmlFor={id}>
        <input id={id} type="checkbox" checked={state.selected} onChange={(event) => onSelect(event.target.checked)} />
        <span className="nutrient-row__name">{nutrient.label}</span>
        <span className="nutrient-row__unit">{nutrient.unit} per 100 g</span>
      </label>

      {state.selected && (
        <div className="nutrient-row__controls">
          <ChoiceGroup
            legend={`${nutrient.label}: goal`}
            name={`${nutrient.key}-goal`}
            options={GOAL_OPTIONS}
            value={state.goal}
            onChange={(value) => onField('goal', value)}
          />
          <ChoiceGroup
            legend={`${nutrient.label}: how much it matters`}
            name={`${nutrient.key}-weight`}
            options={weightOptions}
            value={state.weight}
            onChange={(value) => onField('weight', value)}
            hint={`${weights.max} matters most.`}
          />
        </div>
      )}

      {error && (
        <p className="nl-field__error">
          <Icon name="alert" size={16} />
          {error}
        </p>
      )}
    </div>
  );
}
