import { DataTable } from '../components/dataTable';
import { ProjectCarousel } from '../projects/ProjectCarousel';
import { useProjectsTable } from '../projects/useProjectsTable';
import './projects.css';

/**
 * Projects page: featured carousel on top, the projects table below.
 * Each part gets its data from its own hook (hook -> thunk -> API -> Redux).
 */
export function ProjectsPage() {
  const table = useProjectsTable();
  const total = table.pagination?.totalItems;

  return (
    <main className="projects-page">
      <header className="projects-page__header">
        <h1>Projects</h1>
        <p className="section-subtitle">{total === undefined ? 'Loading…' : `${total.toLocaleString()} projects`}</p>
      </header>

      <ProjectCarousel />

      <section className="projects-page__table" aria-labelledby="projects-table-title">
        <h2 id="projects-table-title" className="section-title">
          All projects
        </h2>
        <DataTable {...table} />
      </section>
    </main>
  );
}
