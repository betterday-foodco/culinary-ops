'use client';

import { useState } from 'react';
import { api, MealRequirement } from '../../../lib/api';
import { format } from 'date-fns';

export default function MealsReportPage() {
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [report, setReport] = useState<MealRequirement[]>([]);
  const [loading, setLoading] = useState(false);

  async function loadReport() {
    setLoading(true);
    try {
      const data = await api.getMealsReport(startDate, endDate);
      setReport(data);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setLoading(false);
    }
  }

  const totalQuantity = report.reduce((sum, m) => sum + m.total_quantity, 0);

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Meals Report</h1>

      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <div className="flex gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
            />
          </div>
          <button
            onClick={loadReport}
            disabled={loading}
            className="px-4 py-2 bg-brand-500 text-white text-sm font-medium rounded-lg hover:bg-brand-600 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {report.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Total Meals</p>
              <p className="text-2xl font-bold text-gray-900">{totalQuantity}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <p className="text-sm text-gray-500 mb-1">Distinct Meal Types</p>
              <p className="text-2xl font-bold text-gray-900">{report.length}</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Meal Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Display Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.map((meal) => (
                  <tr key={meal.meal_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{meal.meal_name}</td>
                    <td className="px-4 py-3 text-gray-600">{meal.display_name}</td>
                    <td className="px-4 py-3 text-gray-600">{meal.total_quantity}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
