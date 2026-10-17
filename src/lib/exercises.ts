import { signal } from '@preact/signals';
import { moveKey } from './program';

/**
 * Exercise pictures from free-exercise-db (public domain, Unlicense), pinned to
 * one commit. Each exercise has two photos: start (0.jpg) and end (1.jpg).
 * Images are fetched on first view and kept by the service worker for offline use.
 */
const IMG_BASE = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5/exercises/';

export const IMG_ORIGIN = 'https://cdn.jsdelivr.net';

export function exerciseImages(id: string): [string, string] {
  return [`${IMG_BASE}${id}/0.jpg`, `${IMG_BASE}${id}/1.jpg`];
}

/** Hand-picked matches for the built-in program's moves (keyed by moveKey) and common names. */
const CURATED: Record<string, string> = {
  'lateral raise': 'Side_Lateral_Raise',
  'biceps curl': 'Dumbbell_Bicep_Curl',
  'triceps extension': 'Standing_Dumbbell_Triceps_Extension',
  'incline chest press': 'Leverage_Incline_Chest_Press',
  'dumbbell shoulder press': 'Dumbbell_Shoulder_Press',
  'dips or pushdown': 'Dips_-_Triceps_Version',
  'hammer curl': 'Hammer_Curls',
  'face pull': 'Face_Pull',
  'abs (plank or leg raise)': 'Plank',
  'close-grip pulldown': 'Close-Grip_Front_Lat_Pulldown',
  'dumbbell row': 'One-Arm_Dumbbell_Row',
  'hip thrust': 'Barbell_Hip_Thrust',
  'chest press': 'Leverage_Chest_Press',
  'shoulder press': 'Machine_Shoulder_Military_Press',
  'triceps pushdown': 'Triceps_Pushdown',
  'lat pulldown': 'Wide-Grip_Lat_Pulldown',
  'seated row': 'Seated_Cable_Rows',
  'romanian deadlift': 'Romanian_Deadlift',
  'cable lateral raise': 'Cable_Seated_Lateral_Raise',
  'incline dumbbell curl': 'Incline_Dumbbell_Curl',
  'overhead triceps extension': 'Cable_Rope_Overhead_Triceps_Extension',
  'incline dumbbell press': 'Incline_Dumbbell_Press',
  'machine shoulder press': 'Machine_Shoulder_Military_Press',
  dips: 'Dips_-_Triceps_Version',
  'cable hammer curl': 'Cable_Hammer_Curls_-_Rope_Attachment',
  'rear delt fly': 'Cable_Rear_Delt_Fly',
  'cable crunch': 'Cable_Crunch',
  'neutral-grip pulldown': 'V-Bar_Pulldown',
  'chest-supported row': 'Dumbbell_Incline_Row',
  'cable pull-through': 'Pull_Through',
  'dumbbell chest press': 'Dumbbell_Bench_Press',
  'v-bar pushdown': 'Triceps_Pushdown_-_V-Bar_Attachment',
  'wide-grip lat pulldown': 'Wide-Grip_Lat_Pulldown',
  'cable row': 'Seated_Cable_Rows',
  'dumbbell romanian deadlift': 'Stiff-Legged_Dumbbell_Deadlift',
  'preacher curl': 'Preacher_Curl',
  'rope pushdown': 'Triceps_Pushdown_-_Rope_Attachment',
  'flat dumbbell press': 'Dumbbell_Bench_Press',
  'arnold press': 'Arnold_Dumbbell_Press',
  'cross-body hammer curl': 'Cross_Body_Hammer_Curl',
  'reverse crunch': 'Reverse_Crunch',
  'single-arm cable row': 'Seated_One-arm_Cable_Pulley_Rows',
  'underhand pulldown': 'Underhand_Cable_Pulldowns',
  'ez-bar curl': 'EZ-Bar_Curl',
  'seated dumbbell shoulder press': 'Seated_Dumbbell_Press',
  'skull crusher': 'EZ-Bar_Skullcrusher',
  'reverse pec deck': 'Reverse_Machine_Flyes',
  'dead bug': 'Dead_Bug',
  'assisted pull-up': 'Band_Assisted_Pull-Up',
  'machine row': 'Leverage_Iso_Row',
  'back extension': 'Hyperextensions_Back_Extensions',
  'machine chest press': 'Leverage_Chest_Press',
  'dips (assisted if needed)': 'Dips_-_Triceps_Version',
  'single-arm dumbbell row': 'One-Arm_Dumbbell_Row',
  'lying leg curl': 'Lying_Leg_Curls',
  // Common names people rename moves to.
  'bench press': 'Barbell_Bench_Press_-_Medium_Grip',
  squat: 'Barbell_Squat',
  'goblet squat': 'Goblet_Squat',
  deadlift: 'Barbell_Deadlift',
  'leg press': 'Leg_Press',
  'leg extension': 'Leg_Extensions',
  'leg curl': 'Seated_Leg_Curl',
  'calf raise': 'Standing_Calf_Raises',
  'pull-up': 'Pullups',
  'push-up': 'Pushups',
  plank: 'Plank',
  crunch: 'Crunches',
  lunge: 'Dumbbell_Lunges',
  'barbell curl': 'Barbell_Curl',
  'hanging leg raise': 'Hanging_Leg_Raise',
  // Setup-wizard library (lib/library.ts).
  'incline push-up': 'Incline_Push-Up',
  'barbell shoulder press': 'Barbell_Shoulder_Press',
  'pec deck': 'Butterfly',
  'cable crossover': 'Cable_Crossover',
  'dumbbell fly': 'Dumbbell_Flyes',
  'bench dips': 'Bench_Dips',
  'barbell row': 'Bent_Over_Barbell_Row',
  'inverted row': 'Inverted_Row',
  'reverse fly': 'Reverse_Flyes',
  superman: 'Superman',
  'bodyweight squat': 'Bodyweight_Squat',
  'glute bridge': 'Butt_Lift_Bridge',
  'step-up': 'Dumbbell_Step_Ups',
  'split squat': 'Split_Squats',
  'dumbbell calf raise': 'Dumbbell_Seated_One-Leg_Calf_Raise',
  'calf raise on a step': 'Calf_Raise_On_A_Dumbbell',
  'mountain climber': 'Mountain_Climbers',
};

/** Lowercase, punctuation to spaces, simple singular ("curls" → "curl"). */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .join(' ');
}

const curatedNorm = new Map(Object.entries(CURATED).map(([k, v]) => [normalizeName(k), v]));

/** Exact-name index over the whole dataset, loaded on first need (a separate small chunk). */
export const exerciseIndex = signal<Map<string, string> | null>(null);
let indexLoading = false;
export function loadExerciseIndex() {
  if (exerciseIndex.value || indexLoading) return;
  indexLoading = true;
  void import('./exercise-index')
    .then(({ EXERCISE_IDS }) => {
      exerciseIndex.value = buildIndex(EXERCISE_IDS);
    })
    .catch(() => (indexLoading = false));
}

export function buildIndex(ids: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const id of ids) {
    const n = normalizeName(id.replace(/_/g, ' '));
    if (!m.has(n)) m.set(n, id);
  }
  return m;
}

/** Image id for a move name, or null when there's no confident match (no picture is shown). */
export function exerciseFor(name: string, index: Map<string, string> | null = exerciseIndex.value): string | null {
  const curated = CURATED[moveKey(name)] ?? curatedNorm.get(normalizeName(name));
  if (curated) return curated;
  return index?.get(normalizeName(name)) ?? null;
}

export interface RoutineItem {
  name: string;
  dose: string;
  id: string;
}

/** Light, dynamic moves to raise heart rate and loosen joints. */
export const WARMUP_ROUTINE: RoutineItem[] = [
  { name: 'Arm circles', dose: '30 s', id: 'Arm_Circles' },
  { name: 'Shoulder circles', dose: '30 s', id: 'Shoulder_Circles' },
  { name: 'Torso rotation', dose: '10 each side', id: 'Torso_Rotation' },
  { name: 'Hip circles', dose: '10 each side', id: 'Standing_Hip_Circles' },
  { name: 'Inchworm', dose: '5 reps', id: 'Inchworm' },
  { name: "World's greatest stretch", dose: '3 each side', id: 'Worlds_Greatest_Stretch' },
];

/** Static stretches, held gently. */
export const COOLDOWN_ROUTINE: RoutineItem[] = [
  { name: 'Chest and shoulder stretch', dose: '30 s', id: 'Chest_And_Front_Of_Shoulder_Stretch' },
  { name: 'Overhead lat stretch', dose: '30 s each side', id: 'Overhead_Lat' },
  { name: 'Triceps stretch', dose: '30 s each side', id: 'Triceps_Stretch' },
  { name: 'Upper back stretch', dose: '30 s', id: 'Upper_Back_Stretch' },
  { name: 'Hamstring stretch', dose: '30 s each side', id: 'Hamstring_Stretch' },
  { name: 'Hip flexor stretch', dose: '30 s each side', id: 'Standing_Hip_Flexors' },
  { name: "Child's pose", dose: '60 s', id: 'Childs_Pose' },
];

/** Every image URL the current program could show, for "save images for offline". */
export function allProgramImageUrls(moveNames: string[]): string[] {
  const ids = new Set<string>();
  for (const n of moveNames) {
    const id = exerciseFor(n);
    if (id) ids.add(id);
  }
  for (const r of [...WARMUP_ROUTINE, ...COOLDOWN_ROUTINE]) ids.add(r.id);
  return [...ids].flatMap(exerciseImages);
}

/** Average picture size, for the "about N MB" estimate. */
export const AVG_IMAGE_KB = 55;

/**
 * Fetches every picture so the service worker stores them (it caches on fetch).
 * Returns how many succeeded. Four at a time keeps a phone responsive.
 */
export async function saveImagesOffline(urls: string[], onProgress: (done: number) => void): Promise<number> {
  let next = 0;
  let ok = 0;
  let done = 0;
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++];
      try {
        const res = await fetch(url, { mode: 'cors' });
        if (res.ok) ok++;
      } catch {
        /* offline or blocked: counted as not saved */
      }
      onProgress(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, urls.length) }, worker));
  return ok;
}

export async function ensureExerciseIndex(): Promise<void> {
  if (exerciseIndex.value) return;
  const { EXERCISE_IDS } = await import('./exercise-index');
  exerciseIndex.value = buildIndex(EXERCISE_IDS);
}
