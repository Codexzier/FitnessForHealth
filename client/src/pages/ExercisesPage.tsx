import { ExerciseForm } from '../components/ExerciseForms';
import type { Exercise } from '../types';
import { ManageList } from './ManageList';

export default function ExercisesPage() {
  return (
    <ManageList<Exercise>
      title="Übungen"
      endpoint="/api/exercises"
      icon="🏋️"
      emptyText="Noch keine Übungen angelegt."
      subtitle={(e) => e.description || 'Keine Beschreibung'}
      renderForm={({ item, ...rest }) => <ExerciseForm key={item?.id ?? 'new'} exercise={item} {...rest} />}
    />
  );
}
