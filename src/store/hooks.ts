import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from './index';

/** Typed versions of useDispatch / useSelector. Use these instead of the plain ones. */
export const useAppDispatch = useDispatch.withTypes<AppDispatch>();
export const useAppSelector = useSelector.withTypes<RootState>();
