"use client";

import Link from "next/link";
import "./../globals.css";

export default function PlowsPage() {
  return (
    <div className="min-h-screen bg-[var(--darkBlue)]">
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
        </div>
      </div>

      {/* Header */}
      <div className="bg-[var(--gold)] text-white p-6 text-center">
        <h1 className="text-4xl font-cormorant font-bold mb-2">VTrans Plow Trucks</h1>
        <p className="text-lg font-cormorant opacity-90">
          Real-time plow truck locations and road conditions across Vermont
        </p>
      </div>

      {/* Embedded Map */}
      <div className="w-full" style={{ height: 'calc(100vh - 200px)' }}>
        <iframe
          src="https://plowtrucks.vtrans.vermont.gov"
          width="100%"
          height="100%"
          frameBorder="0"
          allowFullScreen
          style={{ border: 'none' }}
          title="VTrans Plow Trucks Map"
        />
      </div>

      {/* Footer Info */}
      <div className="bg-[var(--darkBlue)] text-[var(--offWhite2)] p-4 text-center text-sm font-cormorant">
        <p className="opacity-80">
          Map provided by{" "}
          <a 
            href="https://vtrans.vermont.gov" 
            target="_blank" 
            rel="noopener noreferrer"
            className="underline hover:opacity-70"
          >
            Vermont Agency of Transportation
          </a>
          . Data is transmitted over cellular networks and may have occasional inaccuracies.
        </p>
      </div>
    </div>
  );
}







