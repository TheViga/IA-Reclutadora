import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';

export function JobsPage() {
  const qc = useQueryClient();
  const { data: jobs } = useQuery({ queryKey: ['jobs'], queryFn: api.jobs.list });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyDescription, setCompanyDescription] = useState('');
  const [salaryRange, setSalaryRange] = useState('');

  const create = useMutation({
    mutationFn: api.jobs.create,
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setCompanyName('');
      setCompanyDescription('');
      setSalaryRange('');
      qc.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  return (
    <div>
      <h2>Puestos</h2>
      <div className="card">
        <h3>Crear puesto</h3>

        <label>Título del puesto</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ej: Desarrollador Full Stack"
        />

        <label>Descripción del puesto</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Responsabilidades, stack, etc."
        />

        <label>Nombre de la empresa</label>
        <input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="Ej: Acme S.A."
        />

        <label>Descripción de la empresa (1-2 oraciones que dirá la IA)</label>
        <textarea
          value={companyDescription}
          onChange={(e) => setCompanyDescription(e.target.value)}
          rows={2}
          placeholder="Ej: Somos una empresa de software con sede en Bogotá especializada en fintech."
        />

        <label>Rango salarial</label>
        <input
          value={salaryRange}
          onChange={(e) => setSalaryRange(e.target.value)}
          placeholder="Ej: entre 5 y 7 millones de pesos colombianos"
        />

        <button
          disabled={!title || create.isPending}
          onClick={() =>
            create.mutate({
              title,
              description,
              companyName,
              companyDescription,
              salaryRange,
            })
          }
        >
          Crear
        </button>
      </div>

      <table>
        <thead>
          <tr>
            <th>Título</th>
            <th>Empresa</th>
            <th>Salario</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {jobs?.map((j) => (
            <tr key={j.id}>
              <td>{j.title}</td>
              <td>{j.companyName || '—'}</td>
              <td>{j.salaryRange || '—'}</td>
              <td>
                <Link to={`/jobs/${j.id}`}>Ver / preguntas</Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
