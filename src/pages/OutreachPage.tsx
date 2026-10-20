import type { OutreachGroupBy } from '../api/outreach';
import { OutreachGroupSection } from '../outreach/OutreachGroupSection';
import { useProjectOutreach } from '../outreach/useProjectOutreach';
import { formatDate, STATUS_LABELS } from '../projects/projectFormat';
import { Link } from '../router/Link';
import { routes } from '../router/router';
import { Button } from '../widget';
import './outreach.css';
import './projects.css';

/**
 * Outreach page of one project: a summary of the project, a "Group by" choice,
 * and one collapsible table per group (the first one open).
 */
export function OutreachPage({ projectRef }: { projectRef: string }) {
  const outreach = useProjectOutreach(projectRef);
  const { project } = outreach;

  return (
    <main className="projects-page outreach-page">
      <Link to={routes.projects()} className="outreach-page__back">
        ← All projects
      </Link>

      {outreach.notFound ? (
        <div className="outreach-page__message" role="alert">
          <h1>Project not found</h1>
          <p>There is no project “{projectRef}”.</p>
        </div>
      ) : (
        <>
          <header className="outreach-page__header">
            <div>
              <p className="outreach-page__code">{project?.code ?? projectRef}</p>
              <h1>{project ? project.name : 'Loading…'}</h1>
              {project && (
                <p className="section-subtitle">
                  <span className={`badge badge--status-${project.status}`}>{STATUS_LABELS[project.status]}</span> {project.client} · Owner{' '}
                  {project.owner.name} · Due {formatDate(project.dueDate)} · {project.progress}% done
                </p>
              )}
            </div>
          </header>

          <section className="outreach-page__groups" aria-labelledby="outreach-title">
            <div className="outreach-page__bar">
              <div>
                <h2 id="outreach-title" className="section-title">
                  Outreach
                </h2>
                <p className="section-subtitle" aria-live="polite">
                  {outreach.loading && outreach.groups.length === 0
                    ? 'Loading…'
                    : `${outreach.totalItems} attempts in ${outreach.groups.length} groups`}
                </p>
              </div>

              <div className="outreach-page__controls">
                <label className="outreach-page__group-by">
                  Group by
                  <select
                    className="dt-input"
                    value={outreach.groupBy}
                    onChange={(e) => outreach.setGroupBy(e.target.value as OutreachGroupBy)}
                  >
                    {(outreach.groupByOptions.length ? outreach.groupByOptions : [{ value: outreach.groupBy, label: 'Status' }]).map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <Button variant="secondary" size="sm" onClick={outreach.expandAll} disabled={outreach.groups.length === 0}>
                  Expand all
                </Button>
                <Button variant="secondary" size="sm" onClick={outreach.collapseAll} disabled={outreach.openGroups.length === 0}>
                  Collapse all
                </Button>
              </div>
            </div>

            {outreach.error ? (
              <div className="carousel__error" role="alert">
                {outreach.error}{' '}
                <Button variant="link" size="sm" onClick={outreach.retry}>
                  Try again
                </Button>
              </div>
            ) : outreach.groups.length === 0 ? (
              <p className="outreach-page__empty">{outreach.loading ? 'Loading outreach…' : 'No outreach for this project yet.'}</p>
            ) : (
              <div className={`outreach-page__list${outreach.loading ? ' outreach-page__list--loading' : ''}`}>
                {outreach.groups.map((group) => (
                  <OutreachGroupSection
                    key={group.key}
                    group={group}
                    open={outreach.openGroups.includes(group.key)}
                    onToggle={() => outreach.toggleGroup(group.key)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
