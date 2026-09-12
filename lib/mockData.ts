import { ERPState } from './types';
import { CLEAN_BASELINE_STATE } from './cleanDefaults';

// Deprecated mock state: replaced with clean baseline to guarantee no non-database data is used
export const INITIAL_ERP_STATE: ERPState = CLEAN_BASELINE_STATE;
