import { useState, useMemo } from 'react'
import { LayoutGrid, ChevronLeft, ChevronRight } from 'lucide-react'
import { useCategoryBreakdown } from '@/hooks/useAnalytics'
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts'
import { formatCurrency } from '@/lib/formatters'
import { CHART_COLORS } from '@/constants/chartColors'
import { getCurrentYear, getCurrentMonth } from '@/lib/dateUtils'

const COLORS = CHART_COLORS

export default function ExpenseTreemap() {
  const [treemapView, setTreemapView] = useState<'all_time' | 'yearly' | 'monthly'>('all_time')
  const [showSubcategories, setShowSubcategories] = useState(false)
  const [currentYear, setCurrentYear] = useState(getCurrentYear())
  const [currentMonth, setCurrentMonth] = useState(getCurrentMonth())

  // Calculate date range based on selected view
  const getTreemapDateRange = () => {
    if (treemapView === 'monthly') {
      const year = Number.parseInt(currentMonth.substring(0, 4))
      const month = Number.parseInt(currentMonth.substring(5, 7))
      const startDate = new Date(year, month - 1, 1)
      const endDate = new Date(year, month, 0) // Last day of month
      return {
        start_date: startDate.toISOString().split('T')[0],
        end_date: endDate.toISOString().split('T')[0],
      }
    } else if (treemapView === 'yearly') {
      return {
        start_date: `${currentYear}-01-01`,
        end_date: `${currentYear}-12-31`,
      }
    }
    return {} // all_time
  }

  const treemapDateRange = getTreemapDateRange()
  const { data: treemapCategoryData, isLoading } = useCategoryBreakdown({
    transaction_type: 'expense',
    ...treemapDateRange,
  })

  // Prepare treemap data
  const treemapData = useMemo(() => {
    if (!treemapCategoryData?.categories) return []
    
    let colorIdx = 0
    
    if (showSubcategories) {
      // Hierarchical structure with categories and subcategories
      const data = Object.entries(treemapCategoryData.categories)
        .map(([category, catData]: [string, Record<string, unknown>]) => {
          const categoryColor = colorIdx++ % COLORS.length
          
          if (catData.subcategories) {
            const children = Object.entries(catData.subcategories as Record<string, number>)
              .map(([subcat, amount]) => ({
                name: subcat,
                size: Math.abs(amount),
                category,
                subcategory: subcat,
                colorIndex: categoryColor,
              }))
              .sort((a, b) => b.size - a.size)
            
            return {
              name: category,
              category,
              colorIndex: categoryColor,
              children,
            }
          }
          
          return {
            name: category,
            size: Math.abs(catData.total as number),
            category,
            colorIndex: categoryColor,
          }
        })
        .sort((a, b) => {
          const aTotal = 'children' in a && a.children ? a.children.reduce((sum, c) => sum + c.size, 0) : (a.size || 0)
          const bTotal = 'children' in b && b.children ? b.children.reduce((sum, c) => sum + c.size, 0) : (b.size || 0)
          return bTotal - aTotal
        })
      
      return data
    } else {
      // Flat structure with just categories
      const data = Object.entries(treemapCategoryData.categories)
        .map(([category, catData]: [string, Record<string, unknown>]) => ({
          name: category,
          size: Math.abs(catData.total as number),
          category,
          colorIndex: colorIdx++ % COLORS.length,
        }))
        .sort((a, b) => b.size - a.size)
      
      return data
    }
  }, [treemapCategoryData, showSubcategories])

  const handlePrevYear = () => setCurrentYear((prev) => prev - 1)
  const handleNextYear = () => setCurrentYear((prev) => prev + 1)

  const handlePrevMonth = () => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() - 1)
    setCurrentMonth(date.toISOString().substring(0, 7))
  }
  
  const handleNextMonth = () => {
    const date = new Date(currentMonth + '-01')
    date.setMonth(date.getMonth() + 1)
    setCurrentMonth(date.toISOString().substring(0, 7))
  }

  return (
    <div className="glass p-6 rounded-xl border border-white/10">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LayoutGrid className="w-5 h-5 text-purple-400" />
            <h3 className="text-lg font-semibold text-white">Expense Breakdown Treemap</h3>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-2">
            {/* View Mode Dropdown */}
            <select
              value={treemapView}
              onChange={(e) => setTreemapView(e.target.value as 'all_time' | 'yearly' | 'monthly')}
              className="px-3 py-1.5 bg-blue-500/20 border border-blue-500/30 rounded-lg text-blue-300 text-sm focus:outline-none"
            >
              <option value="monthly" className="bg-gray-800 text-gray-200">Monthly View</option>
              <option value="yearly" className="bg-gray-800 text-gray-200">Yearly View</option>
              <option value="all_time" className="bg-gray-800 text-gray-200">All Time</option>
            </select>
            
            {/* Subcategories Checkbox */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showSubcategories}
                onChange={(e) => setShowSubcategories(e.target.checked)}
                className="w-4 h-4 rounded accent-purple-500"
              />
              <span className="text-sm text-gray-300">Subcategories</span>
            </label>
          </div>

          {/* Navigation */}
          {treemapView === 'monthly' && (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevMonth}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-medium min-w-[120px] text-center">
                {new Date(currentMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </span>
              <button
                onClick={handleNextMonth}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
          {treemapView === 'yearly' && (
            <div className="flex items-center gap-3">
              <button
                onClick={handlePrevYear}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="text-white font-medium min-w-[100px] text-center">Year {currentYear}</span>
              <button
                onClick={handleNextYear}
                className="p-1.5 hover:bg-gray-700/50 rounded-lg text-gray-400 hover:text-gray-200 transition-colors"
                type="button"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Treemap Chart with top margin */}
      <div className="mt-6">
        {isLoading ? (
          <div className="h-96 flex items-center justify-center">
            <div className="animate-pulse text-gray-400">Loading treemap...</div>
          </div>
        ) : treemapData.length > 0 ? (
          <ResponsiveContainer width="100%" height={400}>
          <Treemap
            data={treemapData}
            dataKey="size"
            aspectRatio={4 / 3}
            stroke="#fff"
            fill="#8884d8"
            isAnimationActive={false}
            content={(props) => {
              const typedProps = props as unknown as { x: number; y: number; width: number; height: number; name: string; size: number; colorIndex: number; depth: number }
              const { x, y, width, height, name, size, colorIndex } = typedProps
              
              // Hide text in very small boxes
              if (width < 45 || height < 32) return <g />
              
              // Dynamic sizing based on box dimensions
              const boxArea = width * height
              const isVeryLarge = boxArea > 25000
              const isLarge = boxArea > 12000
              const isMedium = boxArea > 6000
              
              const nameFontSize = isVeryLarge ? 14 : isLarge ? 12 : isMedium ? 11 : 10
              const amountFontSize = isVeryLarge ? 12 : isLarge ? 11 : isMedium ? 10 : 9
              
              // Smart truncation
              const maxChars = isVeryLarge ? 25 : isLarge ? 18 : isMedium ? 14 : 12
              const displayName = name.length > maxChars ? name.substring(0, maxChars) + '...' : name
              
              // Calculate padding from edges
              const padding = 6
              const textY = y + padding
              const nameY = height > 50 ? y + height / 2 - 4 : textY + 10
              const amountY = height > 50 ? y + height / 2 + amountFontSize : nameY + amountFontSize + 4
              
              return (
                <g>
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    style={{
                      fill: COLORS[colorIndex],
                      stroke: '#2d3748',
                      strokeWidth: 1.5,
                      opacity: 0.95,
                    }}
                  />
                  {/* Category/Subcategory Name */}
                  <text
                    x={x + width / 2}
                    y={nameY}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={nameFontSize}
                    fontWeight="600"
                    style={{
                      filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.9))',
                      userSelect: 'none',
                    }}
                  >
                    {displayName}
                  </text>
                  {/* Amount */}
                  <text
                    x={x + width / 2}
                    y={amountY}
                    textAnchor="middle"
                    fill="#ffffff"
                    fontSize={amountFontSize}
                    fontWeight="400"
                    style={{
                      filter: 'drop-shadow(0px 1px 2px rgba(0,0,0,0.9))',
                      userSelect: 'none',
                    }}
                  >
                    {formatCurrency(size ?? 0)}
                  </text>
                </g>
              )
            }}
          >
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(17,24,39,0.95)',
                border: '1px solid rgba(139, 92, 246, 0.2)',
                borderRadius: '12px',
                backdropFilter: 'blur(12px)',
                color: '#fff',
              }}
              labelStyle={{ color: '#9ca3af' }}
              itemStyle={{ color: '#fff' }}
              formatter={(value: number | undefined) => formatCurrency(value ?? 0)}
            />
          </Treemap>
        </ResponsiveContainer>
      ) : (
        <div className="h-96 flex items-center justify-center text-gray-400">No data available</div>
      )}
      
      {/* Subtitle */}
      <div className="mt-2 text-sm text-gray-500">
        <p>Rectangle size = expense amount. Hover for details.</p>
        <p>{showSubcategories ? 'Showing expense categories with subcategory breakdown' : 'Showing main expense categories only'}</p>
      </div>
      </div>
    </div>
  )
}
