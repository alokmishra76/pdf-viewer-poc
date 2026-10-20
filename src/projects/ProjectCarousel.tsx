import type { CarouselCard } from '../api/projects';
import { Button } from '../widget';
import { formatDate, formatMoney } from './projectFormat';
import { useProjectCarousel } from './useProjectCarousel';

/** Featured projects above the table, a few cards at a time. */
export function ProjectCarousel() {
  const carousel = useProjectCarousel();
  const showSkeleton = carousel.loading && carousel.cards.length === 0;

  return (
    <section className="carousel" aria-labelledby="carousel-title" aria-roledescription="carousel">
      <header className="carousel__header">
        <div>
          <h2 id="carousel-title" className="section-title">
            Featured projects
          </h2>
          {carousel.totalPages > 0 && (
            <p className="section-subtitle" aria-live="polite">
              {carousel.totalItems} featured · page {carousel.page} of {carousel.totalPages}
            </p>
          )}
        </div>
        <div className="carousel__arrows">
          <Button variant="secondary" size="sm" onClick={carousel.goPrevious} disabled={!carousel.hasPrevious} aria-label="Previous projects">
            ‹
          </Button>
          <Button variant="secondary" size="sm" onClick={carousel.goNext} disabled={!carousel.hasNext} aria-label="Next projects">
            ›
          </Button>
        </div>
      </header>

      {carousel.error ? (
        <div className="carousel__error" role="alert">
          {carousel.error}{' '}
          <Button variant="link" size="sm" onClick={carousel.retry}>
            Try again
          </Button>
        </div>
      ) : (
        <ul className={`carousel__track${carousel.loading ? ' carousel__track--loading' : ''}`}>
          {showSkeleton
            ? Array.from({ length: 4 }, (_, i) => <li key={i} className="project-card project-card--skeleton" aria-hidden="true" />)
            : carousel.cards.map((card) => <ProjectCardItem key={card.id} card={card} />)}
        </ul>
      )}
    </section>
  );
}

function ProjectCardItem({ card }: { card: CarouselCard }) {
  const due = card.isOverdue
    ? `${Math.abs(card.daysRemaining)} days overdue`
    : card.daysRemaining === 0
      ? 'Due today'
      : `${card.daysRemaining} days left`;

  return (
    <li className="project-card" style={{ borderTopColor: card.coverColor }}>
      <div className="project-card__top">
        <span className="project-card__code">{card.code}</span>
        <span className={`badge badge--status-${card.status}`}>{card.statusLabel}</span>
      </div>
      <h3 className="project-card__name">{card.name}</h3>
      <p className="project-card__client">
        {card.client} · {card.owner.name}
      </p>

      <div className="project-card__progress">
        <span className="progress__track">
          <span className="progress__bar" style={{ width: `${card.progress}%`, background: card.coverColor }} />
        </span>
        <span>{card.progress}%</span>
      </div>

      <dl className="project-card__stats">
        <div>
          <dt>Budget used</dt>
          <dd>
            {card.budgetUsedPercent}% of {formatMoney(card.budget)}
          </dd>
        </div>
        <div>
          <dt>Due {formatDate(card.dueDate)}</dt>
          <dd className={card.isOverdue ? 'is-overdue' : undefined}>{due}</dd>
        </div>
      </dl>
    </li>
  );
}
