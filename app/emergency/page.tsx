import Link from "next/link";

export default function EmergencyPage() {
  return (
    <div className="min-h-screen bg-[var(--offWhite)]">
      {/* Navigation Header */}
      <div className="bg-[var(--darkBlue)] text-white p-4 flex items-center justify-between">
        <Link 
          href="/"
          className="text-xl font-cormorant font-bold hover:opacity-80 transition-opacity"
        >
          ← Back to WEATHERbird
        </Link>
        <div className="flex gap-4">
          <Link 
            href="/snow"
            className="px-4 py-2 bg-[var(--neutralBlue)] text-white rounded-lg hover:bg-[var(--neutralBlueDark)] transition-colors font-cormorant font-bold"
          >
            SNOW
          </Link>
          <Link 
            href="/rain"
            className="px-4 py-2 bg-[var(--neutralBlueLight)] text-white rounded-lg hover:bg-[var(--neutralBlue)] transition-colors font-cormorant font-bold"
          >
            RAIN
          </Link>
          <Link 
            href="/emergency"
            className="px-4 py-2 bg-[var(--neutralBlue)] text-white rounded-lg hover:bg-[var(--neutralBlueDark)] transition-colors font-cormorant font-bold"
          >
            EMERGENCY
          </Link>
          <Link 
            href="/plows"
            className="px-4 py-2 bg-[var(--neutralBlueLight)] text-white rounded-lg hover:bg-[var(--neutralBlue)] transition-colors font-cormorant font-bold"
          >
            PLOWS
          </Link>
        </div>
      </div>
      
      <div className="p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-4xl font-bold font-cormorant text-[var(--darkBlue)] mb-6">Emergency Information</h1>
          <p className="text-lg font-cormorant">Emergency preparedness and safety information for Vermont.</p>
        </div>
      </div>
    </div>
  );
}

