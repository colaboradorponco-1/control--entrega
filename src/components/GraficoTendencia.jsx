import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export default function GraficoTendencia({ data, darkMode }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={darkMode ? '#334155' : '#e2e8f0'} />
        <XAxis dataKey="fecha" stroke={darkMode ? '#94a3b8' : '#64748b'} fontSize={12} />
        <YAxis stroke={darkMode ? '#94a3b8' : '#64748b'} fontSize={12} />
        <Tooltip
          contentStyle={{
            backgroundColor: darkMode ? '#0f172a' : '#fff',
            borderColor: darkMode ? '#334155' : '#e2e8f0',
            borderRadius: '8px'
          }}
        />
        <Line type="monotone" dataKey="kilos" stroke="#0ea5e9" strokeWidth={3} dot={{ r: 4 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
