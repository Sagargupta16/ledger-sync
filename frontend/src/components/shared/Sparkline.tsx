import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface SparklineProps {
  data: number[]
  color?: string
  height?: number
}

export default function Sparkline({ data, color = '#8b5cf6', height = 40 }: Readonly<SparklineProps>) {
  const chartData = data.map((value, index) => ({ index, value }))

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
