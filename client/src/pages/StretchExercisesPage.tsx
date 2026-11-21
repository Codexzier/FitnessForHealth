import { StretchExerciseForm } from '../components/ExerciseForms';
import type { StretchExercise } from '../types';
import { ManageList } from './ManageList';

export default function StretchExercisesPage() {
  return (
    <ManageList<StretchExercise>
      title="Stretching-Übungen"
      endpoint="/api/stretch-exercises"
      icon="🧘"
      emptyText="Noch keine Stretching-Übungen angelegt."
      subtitle={(e) => `${e.durationSec} Sekunden`}
      renderForm={({ item, ...rest }) => <StretchExerciseForm key={item?.id ?? 'new'} exercise={item} {...rest} />}
    />
  );
}
