export default function LoadingSpinner({ text = 'Loading...' }) {
  return (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full mr-3" />
      <span className="text-text-muted text-sm">{text}</span>
    </div>
  );
}
