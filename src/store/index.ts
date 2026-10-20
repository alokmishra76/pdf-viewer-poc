import { configureStore } from '@reduxjs/toolkit';
import { authReducer } from '../auth/authSlice';
import { outreachReducer } from '../outreach/outreachSlice';
import { projectsReducer } from '../projects/projectsSlice';

/** The app's Redux store. Add new feature reducers here. */
export const store = configureStore({
  reducer: {
    auth: authReducer,
    projects: projectsReducer,
    outreach: outreachReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
