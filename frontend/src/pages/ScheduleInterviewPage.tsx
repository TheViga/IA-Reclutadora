import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export function ScheduleInterviewPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });
  const { data: candidates } = useQuery({
    queryKey: ['candidates'],
    queryFn: api.candidates.list,
  });

  const [jobId, setJobId] = useState('');
  const [candidateId, setCandidateId] = useState('');
  const [when, setWhen] = useState(() =>
    new Date(Date.now() + 60_000).toISOString().slice(0, 16),
  );

  const schedule = useMutation({
    mutationFn: api.interviews.schedule,
    onSuccess: (iv) => {
      qc.invalidateQueries({ queryKey: ['interviews'] });
      navigate(`/interviews/${iv.id}`);
    },
  });

  return (
    <div>
      <h2>Agendar entrevista</h2>
      <div className="card">
        <label>Puesto</label>
        <select value={jobId} onChange={(e) => setJobId(e.target.value)}>
          <option value="">— elegir —</option>
          {jobs?.map((j) => (
            <option key={j.id} value={j.id}>
              {j.title}
            </option>
          ))}
        </select>

        <label>Candidato</label>
        <select value={candidateId} onChange={(e) => setCandidateId(e.target.value)}>
          <option value="">— elegir —</option>
          {candidates?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.fullName} ({c.phoneE164})
            </option>
          ))}
        </select>

        <label>Fecha y hora</label>
        <input
          type="datetime-local"
          value={when}
          onChange={(e) => setWhen(e.target.value)}
        />

        <button
          disabled={!jobId || !candidateId || schedule.isPending}
          onClick={() =>
            schedule.mutate({
              jobId,
              candidateId,
              scheduledAt: new Date(when).toISOString(),
            })
          }
        >
          Agendar
        </button>
      </div>
    </div>
  );
}
