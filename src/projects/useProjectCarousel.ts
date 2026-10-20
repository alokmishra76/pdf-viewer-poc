import { useCallback, useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { carouselPageChanged, selectProjectCarousel } from './projectsSlice';
import { fetchProjectCarousel } from './projectsThunks';

/** The featured-projects carousel: its cards, and previous / next that respect hasPrevious / hasNext. */
export function useProjectCarousel() {
  const dispatch = useAppDispatch();
  const carousel = useAppSelector(selectProjectCarousel);
  const { page, pagination } = carousel;

  useEffect(() => {
    const request = dispatch(fetchProjectCarousel(page));
    return () => request.abort();
  }, [dispatch, page]);

  const hasPrevious = pagination?.hasPrevious ?? false;
  const hasNext = pagination?.hasNext ?? false;

  const goPrevious = useCallback(() => {
    if (hasPrevious) dispatch(carouselPageChanged(page - 1));
  }, [dispatch, hasPrevious, page]);

  const goNext = useCallback(() => {
    if (hasNext) dispatch(carouselPageChanged(page + 1));
  }, [dispatch, hasNext, page]);

  return {
    cards: carousel.items,
    page,
    totalPages: pagination?.totalPages ?? 0,
    totalItems: pagination?.totalItems ?? 0,
    loading: carousel.status === 'loading',
    error: carousel.status === 'failed' ? carousel.error : null,
    hasPrevious,
    hasNext,
    goPrevious,
    goNext,
    retry: () => dispatch(fetchProjectCarousel(page)),
  };
}
