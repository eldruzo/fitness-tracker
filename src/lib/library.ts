import type { MuscleGroup } from './types';

/**
 * Move library for the setup wizard. Each move fills one slot pattern; the
 * generator picks from the moves that fit the user's equipment and level.
 * Every name has a picture in exercises.ts (checked by a test).
 */
export type Pattern =
  | 'h-push'
  | 'incline-push'
  | 'v-push'
  | 'lateral'
  | 'chest-iso'
  | 'triceps'
  | 'v-pull'
  | 'h-pull'
  | 'rear-delt'
  | 'biceps'
  | 'squat'
  | 'hinge'
  | 'lunge'
  | 'leg-curl'
  | 'leg-ext'
  | 'calf'
  | 'core';

/** gym: needs machines, cables, barbells or bars. dumbbell: a pair of dumbbells and a bench. */
export type Equip = 'gym' | 'dumbbell' | 'bodyweight';
export type Level = 1 | 2 | 3;

export interface LibraryMove {
  name: string;
  pattern: Pattern;
  equip: Equip;
  level: Level;
  bodyweight: boolean;
}

const mv = (name: string, pattern: Pattern, equip: Equip, level: Level = 1): LibraryMove => ({
  name,
  pattern,
  equip,
  level,
  bodyweight: equip === 'bodyweight',
});

export const LIBRARY: LibraryMove[] = [
  // Chest, flat
  mv('Machine chest press', 'h-push', 'gym'),
  mv('Dumbbell chest press', 'h-push', 'dumbbell'),
  mv('Bench press', 'h-push', 'gym', 2),
  mv('Push-up', 'h-push', 'bodyweight'),
  // Chest, incline
  mv('Incline chest press', 'incline-push', 'gym'),
  mv('Incline dumbbell press', 'incline-push', 'dumbbell'),
  mv('Incline push-up', 'incline-push', 'bodyweight'),
  // Shoulders
  mv('Machine shoulder press', 'v-push', 'gym'),
  mv('Dumbbell shoulder press', 'v-push', 'dumbbell'),
  mv('Arnold press', 'v-push', 'dumbbell', 2),
  mv('Barbell shoulder press', 'v-push', 'gym', 2),
  mv('Lateral raise', 'lateral', 'dumbbell'),
  mv('Cable lateral raise', 'lateral', 'gym'),
  // Chest isolation
  mv('Pec deck', 'chest-iso', 'gym'),
  mv('Cable crossover', 'chest-iso', 'gym', 2),
  mv('Dumbbell fly', 'chest-iso', 'dumbbell'),
  // Triceps
  mv('Triceps pushdown', 'triceps', 'gym'),
  mv('Rope pushdown', 'triceps', 'gym'),
  mv('Overhead triceps extension', 'triceps', 'gym'),
  mv('Triceps extension', 'triceps', 'dumbbell'),
  mv('Skull crusher', 'triceps', 'gym', 2),
  mv('Bench dips', 'triceps', 'bodyweight'),
  mv('Dips', 'triceps', 'gym', 2),
  // Back, vertical
  mv('Lat pulldown', 'v-pull', 'gym'),
  mv('Close-grip pulldown', 'v-pull', 'gym'),
  mv('Neutral-grip pulldown', 'v-pull', 'gym'),
  mv('Assisted pull-up', 'v-pull', 'gym'),
  mv('Pull-up', 'v-pull', 'bodyweight', 3),
  // Back, horizontal
  mv('Seated row', 'h-pull', 'gym'),
  mv('Machine row', 'h-pull', 'gym'),
  mv('Single-arm cable row', 'h-pull', 'gym'),
  mv('Barbell row', 'h-pull', 'gym', 2),
  mv('Dumbbell row', 'h-pull', 'dumbbell'),
  mv('Chest-supported row', 'h-pull', 'dumbbell'),
  mv('Inverted row', 'h-pull', 'bodyweight', 2),
  // Rear delts
  mv('Face pull', 'rear-delt', 'gym'),
  mv('Rear delt fly', 'rear-delt', 'gym'),
  mv('Reverse pec deck', 'rear-delt', 'gym'),
  mv('Reverse fly', 'rear-delt', 'dumbbell'),
  mv('Superman', 'rear-delt', 'bodyweight'),
  // Biceps
  mv('Biceps curl', 'biceps', 'dumbbell'),
  mv('Hammer curl', 'biceps', 'dumbbell'),
  mv('Incline dumbbell curl', 'biceps', 'dumbbell', 2),
  mv('Preacher curl', 'biceps', 'gym'),
  mv('EZ-bar curl', 'biceps', 'gym'),
  mv('Cable hammer curl', 'biceps', 'gym'),
  // Legs
  mv('Leg press', 'squat', 'gym'),
  mv('Squat', 'squat', 'gym', 2),
  mv('Goblet squat', 'squat', 'dumbbell'),
  mv('Bodyweight squat', 'squat', 'bodyweight'),
  mv('Romanian deadlift', 'hinge', 'gym', 2),
  mv('Dumbbell Romanian deadlift', 'hinge', 'dumbbell'),
  mv('Hip thrust', 'hinge', 'gym'),
  mv('Back extension', 'hinge', 'gym'),
  mv('Deadlift', 'hinge', 'gym', 3),
  mv('Glute bridge', 'hinge', 'bodyweight'),
  mv('Lunge', 'lunge', 'dumbbell'),
  mv('Step-up', 'lunge', 'dumbbell'),
  mv('Split squat', 'lunge', 'bodyweight'),
  mv('Lying leg curl', 'leg-curl', 'gym'),
  mv('Leg curl', 'leg-curl', 'gym'),
  mv('Leg extension', 'leg-ext', 'gym'),
  mv('Calf raise', 'calf', 'gym'),
  mv('Dumbbell calf raise', 'calf', 'dumbbell'),
  mv('Calf raise on a step', 'calf', 'bodyweight'),
  // Core
  mv('Plank', 'core', 'bodyweight'),
  mv('Dead bug', 'core', 'bodyweight'),
  mv('Reverse crunch', 'core', 'bodyweight'),
  mv('Crunch', 'core', 'bodyweight'),
  mv('Mountain climber', 'core', 'bodyweight'),
  mv('Cable crunch', 'core', 'gym'),
  mv('Hanging leg raise', 'core', 'gym', 3),
];

/** Which muscle group (used by the gap hints) a slot trains. */
export const PATTERN_GROUP: Record<Pattern, MuscleGroup> = {
  'h-push': 'push',
  'incline-push': 'push',
  'v-push': 'push',
  lateral: 'arms',
  'chest-iso': 'push',
  triceps: 'arms',
  'v-pull': 'pull',
  'h-pull': 'pull',
  'rear-delt': 'core',
  biceps: 'arms',
  squat: 'hinge',
  hinge: 'hinge',
  lunge: 'hinge',
  'leg-curl': 'hinge',
  'leg-ext': 'hinge',
  calf: 'hinge',
  core: 'core',
};

/** Equipment the user has → which library moves are allowed. */
export const EQUIP_ALLOWED: Record<Equip, Equip[]> = {
  gym: ['gym', 'dumbbell', 'bodyweight'],
  dumbbell: ['dumbbell', 'bodyweight'],
  bodyweight: ['bodyweight'],
};
