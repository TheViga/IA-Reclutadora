import { NavLink, Route, Routes, Navigate } from 'react-router-dom';
import { JobsPage } from './pages/JobsPage';
import { JobDetailPage } from './pages/JobDetailPage';
import { CandidatesPage } from './pages/CandidatesPage';
import { ScheduleInterviewPage } from './pages/ScheduleInterviewPage';
import { InterviewsListPage } from './pages/InterviewsListPage';
import { InterviewResultPage } from './pages/InterviewResultPage';

export function App() {
  return (
    <div className="app">
      <nav className="sidebar">
        <h1>IA Reclutadora</h1>
        <NavLink to="/jobs">Puestos</NavLink>
        <NavLink to="/candidates">Candidatos</NavLink>
        <NavLink to="/interviews">Entrevistas</NavLink>
        <NavLink to="/schedule">Agendar</NavLink>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/jobs" replace />} />
          <Route path="/jobs" element={<JobsPage />} />
          <Route path="/jobs/:id" element={<JobDetailPage />} />
          <Route path="/candidates" element={<CandidatesPage />} />
          <Route path="/interviews" element={<InterviewsListPage />} />
          <Route path="/interviews/:id" element={<InterviewResultPage />} />
          <Route path="/schedule" element={<ScheduleInterviewPage />} />
        </Routes>
      </main>
    </div>
  );
}
