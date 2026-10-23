// Seeds the freshly migrated e2e database. Flows seed their own seasons (`e2e/db.ts`).
import { seedOrganizer } from './db.ts';

seedOrganizer();
