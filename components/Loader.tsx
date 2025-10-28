
import React from 'react';

interface LoaderProps {
  progress?: {
    processed: number;
    total: number;
  } | null;
  cancelling?: boolean;
}

const Loader: React.FC<LoaderProps> = ({ progress, cancelling = false }) => {
  const percentage = progress ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="flex flex-col items-center justify-center space-y-4 w-full px-4">
      <div className="w-12 h-12 border-4 border-t-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin"></div>
      <p className="text-slate-600 font-semibold">
        {cancelling 
            ? 'Stopping... finishing current batch.'
            : progress 
                ? 'Generating recommendations...' 
                : 'AI is working its magic...'}
      </p>
      {progress && progress.total > 0 && (
        <div className="w-full">
          <div className="w-full bg-slate-200 rounded-full h-2.5">
            <div
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-300"
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
          <p className="text-sm text-slate-500 text-center mt-2">
            {progress.processed} / {progress.total} products
          </p>
        </div>
      )}
    </div>
  );
};

export default Loader;
