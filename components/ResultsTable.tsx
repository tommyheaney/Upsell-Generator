import React, { useMemo } from 'react';
import { RecommendationResult, ProductData } from '../types';

interface ResultsTableProps {
  results: RecommendationResult[];
  originalData: ProductData[];
}

const ResultsTable: React.FC<ResultsTableProps> = ({ results, originalData }) => {
  const { productMapByParentId, productMapByChildId } = useMemo(() => {
    const parentMap = new Map<string, ProductData>();
    originalData.forEach(p => {
      const parentId = String(p['VS Parent ID']);
      if (!parentMap.has(parentId)) {
        parentMap.set(parentId, p);
      }
    });

    const childMap = new Map<string, ProductData>();
    originalData.forEach(p => childMap.set(String(p['VS Child ID']), p));

    return { productMapByParentId: parentMap, productMapByChildId: childMap };
  }, [originalData]);

  const getProductInfo = (parentId: string): { name: string; found: boolean } => {
    const product = productMapByParentId.get(parentId);
    if (product) {
      return { name: String(product['Parent Product Title']), found: true };
    }
    return { name: `Unmatched ID: ${parentId}`, found: false };
  };

  return (
    <div className="overflow-x-auto bg-white rounded-lg shadow border border-slate-200">
      <div className="max-h-[600px] overflow-y-auto">
        <table className="w-full text-sm text-left text-slate-500">
          <thead className="text-xs text-slate-700 uppercase bg-slate-100 sticky top-0 z-10">
            <tr>
              <th scope="col" className="px-6 py-3 min-w-[250px]">
                Original Product
              </th>
              <th scope="col" className="px-6 py-3 min-w-[300px]">
                Upselling 1 (Customers Also Bought)
              </th>
              <th scope="col" className="px-6 py-3 min-w-[300px]">
                Upselling 2 (You May Also Like)
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((item) => {
              const originalProduct = productMapByChildId.get(String(item.vsChildId));
              if (!originalProduct) return null;

              return (
                <tr key={item.vsChildId} className="bg-white border-b hover:bg-slate-50 align-top">
                  <td className="px-6 py-4 font-medium text-slate-900">
                    <div className="font-bold">{String(originalProduct['Parent Product Title'])}</div>
                    <div className="text-xs text-slate-500">Child ID: {item.vsChildId}</div>
                  </td>
                  <td className="px-6 py-4">
                    <ul className="space-y-1">
                      {item.upselling1.map((id, index) => {
                        const productInfo = getProductInfo(id);
                        return (
                          <li key={`${item.vsChildId}-u1-${index}`} className={`text-xs p-1.5 rounded ${
                            productInfo.found ? 'bg-slate-100' : 'bg-red-100 text-red-700 font-semibold'
                          }`}>
                            {productInfo.name}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                   <td className="px-6 py-4">
                    <ul className="space-y-1">
                      {item.upselling2.map((id, index) => {
                        const productInfo = getProductInfo(id);
                        return (
                          <li key={`${item.vsChildId}-u2-${index}`} className={`text-xs p-1.5 rounded ${
                            productInfo.found ? 'bg-indigo-50' : 'bg-red-100 text-red-700 font-semibold'
                          }`}>
                            {productInfo.name}
                          </li>
                        );
                      })}
                    </ul>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ResultsTable;