import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export default function GraficoSucursales({ data, darkMode }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} />
        <XAxis type="number" stroke={darkMode ? '#94a3b8' : '#64748b'} fontSize={12} />
        <YAxis dataKey="nombre" type="category" stroke={darkMode ? '#94a3b8' : '#64748b'} fontSize={12} width={100} />
        <Tooltip
          cursor={{ fill: darkMode ? '#1e293b' : '#f1f5f9' }}
          contentStyle={{
            backgroundColor: darkMode ? '#0f172a' : '#fff',
            borderColor: darkMode ? '#334155' : '#e2e8f0',
            borderRadius: '8px'
          }}
        />
        <Bar dataKey="kilos" fill="#f59e0b" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={index % 2 === 0 ? '#f59e0b' : '#d97706'} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
