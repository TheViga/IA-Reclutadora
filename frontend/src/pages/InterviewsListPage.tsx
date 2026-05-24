import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export function InterviewsListPage() {
  const { data } = useQuery({
    queryKey: ['interviews'],
    queryFn: api.interviews.list,
    refetchInterval: 5_000,
  });

  return (
    <div>
      <h2>Entrevistas</h2>
      <table>
        <thead>
          <tr>
            <th>Candidato</th>
            <th>Puesto</th>
            <th>Fecha</th>
            <th>Estado</th>
            <th>Score</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {data?.map((iv) => (
            <tr key={iv.id}>
              <td>{iv.candidate?.fullName}</td>
              <td>{iv.job?.title}</td>
              <td>{new Date(iv.scheduledAt).toLocaleString()}</td>
              <td>
                <span className={`badge ${iv.status}`}>{iv.status}</span>
              </td>
              <td>{iv.overallScore?.toFixed(2) ?? '—'}</td>
              <td>
                <Link to={`/interviews/${iv.id}`}>Ver</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
