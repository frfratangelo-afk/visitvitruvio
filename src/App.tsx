import { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import confetti from 'canvas-confetti';
import { 
  Compass, 
  Search, 
  BookOpen, 
  Layers, 
  Store, 
  Milestone, 
  Navigation, 
  Volume2, 
  VolumeX, 
  Info, 
  Calendar, 
  MapPin, 
  RotateCcw, 
  Sparkles, 
  Phone, 
  Mail, 
  Globe, 
  Printer, 
  ArrowRight, 
  ChevronRight, 
  Play, 
  Pause, 
  Clock, 
  Check, 
  AlertCircle, 
  Share2, 
  HelpCircle,
  FileText
} from 'lucide-react';
import { TAPPE, TOURS_POSTER_INFO, GENERAL_INFO } from './data';
import { Tappa, UserPosition } from './types';

export default function App() {
  const [lang, setLang] = useState<'it' | 'en'>('it');
  const [activeTappaId, setActiveTappaId] = useState<number>(1);
  const [userPosition, setUserPosition] = useState<UserPosition | null>(null);
  const [isSimulating, setIsSimulating] = useState<boolean>(false);
  const [arrivedAlert, setArrivedAlert] = useState<boolean>(false);
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // Map and Markers references
  const mapRef = useRef<any>(null);
  const userMarkerRef = useRef<any>(null);
  const markersRef = useRef<{ [key: number]: any }>({});
  const simulationIntervalRef = useRef<any>(null);

  const activeTappa = TAPPE.find(t => t.id === activeTappaId) || TAPPE[0];

  // Map element container ID
  const mapContainerId = "tour-fano-map";

  // Dynamic self-referential URL for the QR code, customizable by the user
  const [currentAppUrl, setCurrentAppUrl] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      // If we are on the europe-west1.run.app domain (AI Studio Cloud Run),
      // we suggest the non-auth Shared public site URL so that scanning with physical phones works!
      if (window.location.hostname.includes('run.app')) {
        return 'https://ais-pre-yfbnpmhylffdv4cfzpgfpe-537055341569.europe-west1.run.app';
      }
      return window.location.href;
    }
    return 'https://ais-pre-yfbnpmhylffdv4cfzpgfpe-537055341569.europe-west1.run.app';
  });

  // Initialize Speech Synthesis
  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang === 'it' ? 'it-IT' : 'en-US';
    utterance.rate = 0.95;

    utterance.onend = () => {
      setIsSpeaking(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const stopSpeaking = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  // Toggle voice reading
  const toggleSpeech = (text: string) => {
    if (isSpeaking) {
      stopSpeaking();
    } else {
      speakText(text);
    }
  };

  // Clear speech on language change
  useEffect(() => {
    stopSpeaking();
  }, [lang]);

  // Haversine formula to compute distance in meters
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // Calculate relative bearing (degrees)
  const getBearingDegrees = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const lat1Rad = lat1 * Math.PI / 180;
    const lat2Rad = lat2 * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(lat2Rad);
    const x = Math.cos(lat1Rad) * Math.sin(lat2Rad) -
              Math.sin(lat1Rad) * Math.cos(lat2Rad) * Math.cos(dLon);
    const brng = Math.atan2(y, x) * 180 / Math.PI;
    return (brng + 360) % 360;
  };

  // Get distance & bearing values from user to active tappa
  const currentDistance = userPosition 
    ? getDistanceMeters(userPosition.lat, userPosition.lng, activeTappa.lat, activeTappa.lng)
    : null;

  const currentBearing = userPosition
    ? getBearingDegrees(userPosition.lat, userPosition.lng, activeTappa.lat, activeTappa.lng)
    : null;

  // Initialize and update Map
  useEffect(() => {
    const L = (window as any).L;
    if (!L) return;

    // Create Map if it doesn't exist
    if (!mapRef.current) {
      const map = L.map(mapContainerId, {
        center: [43.844415, 13.017740],
        zoom: 19,
        maxZoom: 21,
        minZoom: 17,
        zoomControl: false // custom position instead
      });

      L.control.zoom({
        position: 'topright'
      }).addTo(map);

      // Add high-contrast OpenStreetMap tile layers
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        subdomains: 'abcd',
        maxZoom: 21
      }).addTo(map);

      mapRef.current = map;
    }

    const map = mapRef.current;

    // Create div icons for each Tappa
    TAPPE.forEach((tappa) => {
      const isActive = tappa.id === activeTappaId;
      
      // Update or create markers
      if (markersRef.current[tappa.id]) {
        // Marker exists - update icon to reflect active state
        const marker = markersRef.current[tappa.id];
        marker.setIcon(createTappaIcon(L, tappa.number, isActive));
      } else {
        // Create new marker
        const marker = L.marker([tappa.lat, tappa.lng], {
          icon: createTappaIcon(L, tappa.number, isActive)
        }).addTo(map);

        // Click marker handlers
        marker.on('click', () => {
          handleSelectTappa(tappa.id);
        });

        // Add beautiful popup hint
        marker.bindTooltip(lang === 'it' ? tappa.title : tappa.titleEn, {
          direction: 'top',
          offset: [0, -10],
          className: 'px-2 py-1 text-xs font-semibold rounded bg-slate-900 text-white border-0 shadow'
        });

        markersRef.current[tappa.id] = marker;
      }
    });

    // Cleanup on unmount (only if entirely destroyed.
    // However, since hot reload is handled, keeping map in ref is great)
  }, [activeTappaId, lang]);

  // Handle setting User GPS position marker
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !mapRef.current) return;

    if (userPosition) {
      if (userMarkerRef.current) {
        // Update user marker position
        userMarkerRef.current.setLatLng([userPosition.lat, userPosition.lng]);
        userMarkerRef.current.setIcon(createUserIcon(L, userPosition.simulated));
      } else {
        // Create user marker
        const userMarker = L.marker([userPosition.lat, userPosition.lng], {
          icon: createUserIcon(L, userPosition.simulated),
          zIndexOffset: 1000 // Make sure user is on top
        }).addTo(mapRef.current);

        userMarker.bindTooltip(lang === 'it' ? "Tu sei qui" : "You are here", {
          direction: 'top',
          className: 'px-2 py-0.5 text-xs font-bold rounded-full bg-blue-600 text-white border-0 shadow'
        });

        userMarkerRef.current = userMarker;
      }
    } else {
      // Remove user marker if null
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
    }
  }, [userPosition, lang]);

  // Handle focus changes (pan map to selected Tappa)
  const handleSelectTappa = (id: number) => {
    setActiveTappaId(id);
    stopSpeaking();
    
    // Pan map to selection
    if (mapRef.current) {
      const selected = TAPPE.find(t => t.id === id);
      if (selected) {
        mapRef.current.setView([selected.lat, selected.lng], 19, {
          animate: true,
          duration: 0.8
        });
      }
    }
  };

  // Icon Helper mapping with editorial colors
  const getIconComponent = (name: string) => {
    switch (name) {
      case "Compass": return <Compass className="w-5 h-5 text-[#8B8378]" />;
      case "Search": return <Search className="w-5 h-5 text-[#8B8378]" />;
      case "BookOpen": return <BookOpen className="w-5 h-5 text-[#8B8378]" />;
      case "Layers": return <Layers className="w-5 h-5 text-[#8B8378]" />;
      case "Store": return <Store className="w-5 h-5 text-[#8B8378]" />;
      case "Milestone": return <Milestone className="w-5 h-5 text-[#8B8378]" />;
      default: return <Info className="w-5 h-5 text-[#8B8378]" />;
    }
  };

  // Helper for generating custom Tappa div SVG icon inside Leaflet
  const createTappaIcon = (L: any, num: string, active: boolean) => {
    return L.divIcon({
      className: 'tappa-custom-div-icon',
      html: `
        <div class="flex items-center justify-center w-8 h-8 border transition-all duration-300 ${
          active 
            ? 'bg-[#1C1C1C] border-[#1C1C1C] text-[#FAF9F6] font-bold shadow-md' 
            : 'bg-[#FAF9F6] border-[#D1CEC7] text-[#1C1C1C] hover:border-[#1C1C1C] font-semibold'
        }" style="transform: translate(-15px, -15px); width: 30px; height: 30px; border-radius: 0px;">
          <span style="font-family: 'Space Grotesk', sans-serif; font-size: 13px;">${num}</span>
        </div>
      `,
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });
  };

  // Helper for generating custom User position icon inside Leaflet
  const createUserIcon = (L: any, simulated: boolean) => {
    return L.divIcon({
      className: 'user-custom-div-icon',
      html: `
        <div class="gps-pulse-effect flex items-center justify-center w-5 h-5 rounded-full bg-[#8B8378] border border-[#FAF9F6] shadow-sm" style="transform: translate(-10px, -10px);">
          <div class="w-2.5 h-2.5 rounded-full ${simulated ? 'bg-[#FAF9F6]' : 'bg-[#1C1C1C]'}"></div>
        </div>
      `,
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
  };

  // Start Actual Device Geolocation
  const handleEnableRealGPS = () => {
    setGpsError(null);
    if (!navigator.geolocation) {
      setGpsError(lang === 'it' ? "Geolocalizzazione non supportata dal browser." : "Geolocation is not supported by your browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setUserPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          simulated: false
        });

        // Center map to user position if broad area is close
        if (mapRef.current) {
          mapRef.current.setView([position.coords.latitude, position.coords.longitude], 19);
        }
      },
      (error) => {
        console.error("GPS Error", error);
        let errorMsg = lang === 'it' 
          ? "Permesso GPS negato o segnale non disponibile. Prova ad attivare la simulazione per testare il percorso!"
          : "GPS Permission denied or unavailable. Toggle 'Simulate GPS' to easily test the guide!";
        setGpsError(errorMsg);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Initialize Simulator near Sala Morganti of Museo del Palazzo Malatestiano
  const handleTriggerGpsSimulation = () => {
    setIsSimulating(false);
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
    }

    // Set starting position at entry point near Museo del Palazzo Malatestiano
    setUserPosition({
      lat: 43.843450,
      lng: 13.018500,
      simulated: true
    });

    if (mapRef.current) {
      mapRef.current.setView([43.843620, 13.018680], 19, {
        animate: true,
        duration: 1
      });
    }
  };

  // Walk simulated coordinates step-by-step toward active Tappa
  const handleSmoothWalkSimulation = () => {
    if (!userPosition) {
      // If no position exists, initialize it first
      handleTriggerGpsSimulation();
      return;
    }

    if (isSimulating) {
      // Toggle off
      setIsSimulating(false);
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
      return;
    }

    setIsSimulating(true);

    const stepSize = 0.000045; // Smooth walking step latitude/longitude
    let currentLat = userPosition.lat;
    let currentLng = userPosition.lng;

    simulationIntervalRef.current = setInterval(() => {
      const dLat = activeTappa.lat - currentLat;
      const dLng = activeTappa.lng - currentLng;
      const distance = getDistanceMeters(currentLat, currentLng, activeTappa.lat, activeTappa.lng);

      if (distance < 3) {
        // Arrived at destination!
        clearInterval(simulationIntervalRef.current);
        setIsSimulating(false);
        setUserPosition({
          lat: activeTappa.lat,
          lng: activeTappa.lng,
          simulated: true
        });

        // Trigger confetti celebration!
        confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 }
        });

        setArrivedAlert(true);
        // Automatically start voice-guide descriptions!
        speakText(lang === 'it' ? activeTappa.description : activeTappa.descriptionEn);

        // Center map directly on active arrived tappa
        if (mapRef.current) {
          mapRef.current.setView([activeTappa.lat, activeTappa.lng], 19);
        }
      } else {
        // Move one step closer
        const angle = Math.atan2(dLng, dLat);
        currentLat += Math.cos(angle) * stepSize;
        currentLng += Math.sin(angle) * stepSize;

        setUserPosition({
          lat: currentLat,
          lng: currentLng,
          simulated: true
        });

        // Softly center map on user as they walk
        if (mapRef.current) {
          mapRef.current.panTo([currentLat, currentLng]);
        }
      }
    }, 200);
  };

  const handleStopSimulation = () => {
    setIsSimulating(false);
    if (simulationIntervalRef.current) {
      clearInterval(simulationIntervalRef.current);
    }
    setUserPosition(null);
  };

  // Close arrived alert
  const closeArrivedAlert = () => {
    setArrivedAlert(false);
    stopSpeaking();
  };

  // Clean elements
  useEffect(() => {
    return () => {
      if (simulationIntervalRef.current) {
        clearInterval(simulationIntervalRef.current);
      }
    };
  }, []);

  return (
    <div className="min-h-screen text-[#1C1C1C] flex flex-col font-serif bg-[#FAF9F6] antialiased selection:bg-[#EFECE6] selection:text-[#1C1C1C]">
      
      {/* ARCHIVAL TOP RULE & MASTHEAD BANNER */}
      <div className="border-t-[4px] border-b border-[#1C1C1C] mt-2 mb-1 max-w-7xl mx-auto w-full"></div>

      {/* WEB DESK HEADER OR BANNER */}
      <header className="bg-[#FAF9F6] sticky top-0 z-40 px-4 py-4 max-w-7xl mx-auto w-full border-b border-[#D1CEC7]">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="bg-[#1C1C1C] p-2 rounded-none border border-[#1C1C1C] text-[#FAF9F6]">
              <Compass className="w-6 h-6 animate-spin-slow" />
            </div>
            <div>
              <span className="text-[10px] font-sans tracking-[0.25em] uppercase font-bold text-[#8B8378] block">
                {lang === 'it' ? 'PORTALE ARCHEOLOGICO DI FANO' : 'ARCHAEOLOGICAL PORTAL OF FANO'}
              </span>
              <h1 className="text-2xl md:text-3xl font-display-serif font-bold tracking-tight text-[#1C1C1C]">
                Tour Vitruvio <span className="text-[#8B8378] font-serif italic font-normal text-lg md:text-xl tracking-normal">fano</span>
              </h1>
              <p className="text-xs text-[#8B8378] font-sans font-medium">
                {lang === 'it' ? 'Scavi di Piazza Andrea Costa — Percorso Culturale ed Epigrafico' : 'Piazza Andrea Costa Excavations — Cultural & Epigraphic Path'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Language switch flags */}
            <div className="flex bg-[#EFECE6] p-1 border border-[#D1CEC7] text-[10px] font-sans font-bold leading-none gap-1" id="lang-switch">
              <button 
                id="btn-lang-it"
                onClick={() => setLang('it')}
                className={`px-3 py-2 transition-all cursor-pointer ${lang === 'it' ? 'bg-[#1C1C1C] text-white font-extrabold' : 'text-[#8B8378] hover:text-[#1C1C1C]'}`}
              >
                🇮🇹 IT
              </button>
              <button 
                id="btn-lang-en"
                onClick={() => setLang('en')}
                className={`px-3 py-2 transition-all cursor-pointer ${lang === 'en' ? 'bg-[#1C1C1C] text-white font-extrabold' : 'text-[#8B8378] hover:text-[#1C1C1C]'}`}
              >
                🇬🇧 EN
              </button>
            </div>

            {/* Quick QR link trigger for smart mobile guide flyer */}
            <button
              id="header-btn-qr"
              onClick={() => setShowQRModal(true)}
              className="px-4 py-2 bg-[#1C1C1C] hover:bg-[#8B8378] text-[#FAF9F6] font-sans uppercase tracking-wider text-[11px] font-bold flex items-center gap-2 transition-all cursor-pointer border border-[#1C1C1C] hover:border-[#8B8378]"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>{lang === 'it' ? 'MOSTRA PALINA / QR' : 'SHOW SIGNBOARD / QR'}</span>
            </button>
          </div>
        </div>
      </header>

      {/* CORE DUAL DESKTOP GRID */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-6 md:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        
        {/* LEFT COLUMN: INTERACTIVE GEOGUIDE SMARTPHONE INTERFACE (8 COLS ON DESKTOP) */}
        <section className="lg:col-span-8 flex flex-col bg-[#FAF9F6] border border-[#D1CEC7] rounded-none shadow-sm overflow-hidden relative" id="section-app-viewport">
          
          {/* VIEWPORT ALERT STRIP */}
          {gpsError && (
            <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs font-medium flex items-center gap-2.5 animate-fadeIn" id="gps-error-alert">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span className="flex-1 text-left">{gpsError}</span>
              <button 
                onClick={() => setGpsError(null)} 
                className="text-amber-800 font-bold hover:text-amber-950 px-2 cursor-pointer"
                id="close-gps-error-btn"
              >
                ✕
              </button>
            </div>
          )}

          {/* APPLICATION INTRO BANNER FOR GEOLOCATION / SIMULATOR OPTIONS */}
          <div className="bg-[#EFECE6] border-b border-[#D1CEC7] p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4" id="controls-banner">
            <div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-none bg-[#1C1C1C] animate-pulse"></span>
                <h2 className="text-xs font-sans font-bold tracking-[0.2em] text-[#1C1C1C] uppercase">
                  {lang === 'it' ? 'SISTEMA DI ORIENTAMENTO GPS' : 'GPS POSITIONING ENGINE'}
                </h2>
              </div>
              <p className="text-xs text-[#8B8378] font-serif italic mt-1">
                {lang === 'it' 
                  ? 'Abilita il satellite locale o simula l\'itinerario di visita nel nucleo di Fano.' 
                  : 'Enable local satellite tracking or simulate the walk inside ancient Fano.'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2" id="gps-buttons-wrapper">
              {/* Actual Browser GPS */}
              <button
                id="btn-activate-real-gps"
                onClick={handleEnableRealGPS}
                className={`px-3 py-1.5 text-xs font-sans tracking-wide uppercase transition-all cursor-pointer rounded-none border ${
                  userPosition && !userPosition.simulated
                    ? 'bg-[#1C1C1C] border-[#1C1C1C] text-[#FAF9F6]'
                    : 'bg-[#FAF9F6] border-[#D1CEC7] text-[#1C1C1C] hover:border-[#1C1C1C]'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <MapPin className="w-3 h-3" />
                  {lang === 'it' ? 'Mio GPS' : 'My GPS'}
                </span>
              </button>

              {/* Simulation triggers */}
              {!userPosition || !userPosition.simulated ? (
                <button
                  id="btn-simulate-gps-fano"
                  onClick={handleTriggerGpsSimulation}
                  className="px-3 py-1.5 bg-[#1C1C1C] border border-[#1C1C1C] hover:bg-[#8B8378] hover:border-[#8B8378] text-[#FAF9F6] text-xs font-sans tracking-wide uppercase transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    {lang === 'it' ? 'Simula' : 'Simulate'}
                  </span>
                </button>
              ) : (
                <div className="flex items-center gap-1">
                  <button
                    id="btn-walk-simulation"
                    onClick={handleSmoothWalkSimulation}
                    className={`px-3 py-1.5 border text-xs font-sans tracking-wide uppercase transition-all cursor-pointer ${
                      isSimulating 
                        ? 'bg-[#8B8378] border-[#8B8378] text-white animate-pulse' 
                        : 'bg-[#1C1C1C] border-[#1C1C1C] text-white'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {isSimulating ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      {isSimulating 
                        ? (lang === 'it' ? 'Pausa' : 'Pause') 
                        : (lang === 'it' ? 'Cammina' : 'Walk')}
                    </span>
                  </button>

                  <button
                    id="btn-disconnect-simulator"
                    onClick={handleStopSimulation}
                    title={lang === 'it' ? "Disattiva Simulazione" : "Disconnect Simulation"}
                    className="p-1.5 bg-[#FAF9F6] border border-[#D1CEC7] hover:border-[#1C1C1C] text-[#8B8378] hover:text-[#1C1C1C] transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* SIMULATED WALK DIRECTION INDICATOR (COMPASS HUD) */}
          {userPosition && (
            <div className="bg-[#FAF9F6] border-b border-[#D1CEC7] px-4 py-3 flex flex-wrap items-center justify-between gap-4" id="hud-nav-bar">
              <div className="flex items-center gap-3">
                <div 
                  className="bg-[#FAF9F6] border border-[#D1CEC7] w-10 h-10 rounded-full flex items-center justify-center relative transition-transform duration-300"
                  style={{ transform: `rotate(${currentBearing || 0}deg)` }}
                  title={lang === 'it' ? `Angolo direzione: ${Math.round(currentBearing || 0)}°` : `Direction Angle: ${Math.round(currentBearing || 0)}°`}
                  id="hud-compass-disc"
                >
                  <Navigation className="w-4 h-4 text-[#1C1C1C] fill-[#1C1C1C]" style={{ transform: 'rotate(-45deg)' }} />
                  <div className="absolute top-0 text-[7px] font-sans font-bold text-[#8B8378]">N</div>
                </div>

                <div>
                  <div className="text-[10px] font-sans tracking-wider text-[#8B8378] uppercase font-bold">{lang === 'it' ? 'GUIDA AL PERCORSO' : 'COURSE GUIDANCE'}</div>
                  <div className="text-xs font-serif text-[#1C1C1C] flex items-center gap-1.5" id="hud-distance-label">
                    {lang === 'it' ? 'Distanza alla tappa' : 'Distance to stop'} {activeTappa.number}: 
                    <span className="font-mono font-bold text-sm text-[#1C1C1C] underline decoration-[#8B8378]">
                      {currentDistance !== null 
                        ? (currentDistance > 1000 
                            ? `${(currentDistance / 1000).toFixed(1)} km` 
                            : `${Math.round(currentDistance)} m`)
                        : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Simulated notification */}
              <div className="text-[10px] font-sans tracking-wide uppercase font-bold px-3 py-1 bg-[#EFECE6] text-[#1C1C1C] border border-[#D1CEC7] flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-[#8B8378] animate-ping"></span>
                <span>
                  {userPosition.simulated 
                    ? (lang === 'it' ? 'SIMULATORE ATTIVO' : 'SIMULATOR ACTIVE') 
                    : (lang === 'it' ? 'GPS ATTIVO' : 'LIVE GPS ACTIVE')}
                </span>
              </div>
            </div>
          )}

          {/* MAIN INTERACTIVE AREA SPLIT: MAP & CONTROLS */}
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 min-h-[420px] md:min-h-[500px]">
            
            {/* MAP CONTAINER (COL 7) */}
            <div className="md:col-span-7 relative border-b md:border-b-0 md:border-r border-stone-250 flex flex-col">
              {/* Leaflet map div */}
              <div id={mapContainerId} className="w-full flex-1 min-h-[300px] md:min-h-0 z-10"></div>
              
              {/* Map Floating instructions */}
              <div className="absolute bottom-3 left-3 z-20 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-lg shadow border border-slate-150 text-[11px] font-medium text-slate-500 pointer-events-none">
                📍 {lang === 'it' ? 'Clicca i marcatori per sbloccare le spiegazioni' : 'Click markers to unlock explanations'}
              </div>
            </div>

            {/* EXPANDED TAPPA CARD (COL 5 ON RIGHT) */}
            <div className="md:col-span-5 flex flex-col bg-[#FAF9F6] border-t md:border-t-0 border-[#D1CEC7] overflow-y-auto" id="selected-tappa-details-panel">
              
              {/* Tappa Banner & Selector */}
              <div className="bg-[#FAF9F6] p-4 border-b border-[#D1CEC7]">
                <div className="flex items-center justify-between text-[10px] font-sans font-bold text-[#8B8378] uppercase tracking-[0.2em] mb-2.5">
                  <span>{lang === 'it' ? 'Tappa Corrente' : 'Current Stop'}</span>
                  <span className="px-2 py-0.5 bg-[#EFECE6] border border-[#D1CEC7] text-[#1C1C1C] font-mono text-[10px] uppercase font-semibold">
                    {activeTappa.era}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-none bg-[#1C1C1C] text-[#FAF9F6] flex items-center justify-center font-sans font-extrabold text-sm shadow-sm" id="active-badge-number">
                    {activeTappa.number}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-display-serif font-black text-[#1C1C1C] leading-tight truncate">
                      {lang === 'it' ? activeTappa.title : activeTappa.titleEn}
                    </h3>
                    <p className="text-xs text-[#8B8378] font-serif italic truncate flex items-center gap-1 mt-1">
                      <MapPin className="w-3.5 h-3.5 text-[#8B8378] shrink-0" />
                      {lang === 'it' ? activeTappa.locationDetails : activeTappa.locationDetailsEn}
                    </p>
                  </div>
                </div>
              </div>

              {/* Tappa Descriptions Content */}
              <div className="p-4 md:p-5 flex-1 flex flex-col gap-5 text-justify bg-[#FAF9F6]">
                
                {/* Voice guide synthesizer controller */}
                <div className="bg-[#EFECE6] border border-[#D1CEC7] rounded-none p-3.5 flex items-center justify-between gap-3" id="tts-audio-banner">
                  <div className="flex items-center gap-3">
                    <div className="bg-[#1C1C1C] text-[#FAF9F6] p-2">
                      {isSpeaking ? (
                        <Volume2 className="w-4 h-4 animate-bounce" />
                      ) : (
                        <VolumeX className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <div className="text-[11px] font-sans font-bold uppercase tracking-wider text-[#1C1C1C]">{lang === 'it' ? 'AUDIOGUIDA VOCALE' : 'SPOKEN NARRATION'}</div>
                      <div className="text-[10px] text-[#8B8378] font-serif italic">
                        {isSpeaking 
                          ? (lang === 'it' ? 'Lettura in corso...' : 'Synthesizing voice...') 
                          : (lang === 'it' ? 'Sintesi vocale locale' : 'Local text-to-speech assistant')}
                      </div>
                    </div>
                  </div>

                  <button
                    id="btn-voice-toggle"
                    onClick={() => toggleSpeech(lang === 'it' ? activeTappa.description : activeTappa.descriptionEn)}
                    className={`px-3 py-1.5 rounded-none text-[10px] font-sans font-bold tracking-wider uppercase transition-all cursor-pointer ${
                      isSpeaking 
                        ? 'bg-[#C2410C] hover:bg-[#9A3412] text-[#FAF9F6]' 
                        : 'bg-[#1C1C1C] hover:bg-[#8B8378] text-[#FAF9F6]'
                    }`}
                  >
                    <span>{isSpeaking ? (lang === 'it' ? 'FERMA' : 'STOP') : (lang === 'it' ? 'ASCOLTA' : 'NARRATE')}</span>
                  </button>
                </div>

                {/* Spiegazione (Italian / Eng) */}
                <div>
                  <h4 className="text-[10px] font-sans font-bold uppercase text-[#8B8378] tracking-[0.2em] mb-2.5">{lang === 'it' ? 'La Spiegazione' : 'The Historical Context'}</h4>
                  <p className="text-sm text-[#1C1C1C] leading-relaxed font-serif first-letter:text-4xl first-letter:font-bold first-letter:font-display-serif first-letter:text-[#1C1C1C] first-letter:mr-2.5 first-letter:float-left first-letter:leading-none">
                    {lang === 'it' ? activeTappa.description : activeTappa.descriptionEn}
                  </p>
                </div>

                {/* Detailed bullet findings (Directly transcribed from PDF content only) */}
                <div className="border-t border-[#D1CEC7]/40 pt-4" id="tappa-findings-list-wrapper">
                  <h4 className="text-[10px] font-sans font-bold uppercase text-[#8B8378] tracking-[0.2em] mb-3 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-[#8B8378]" />
                    <span>{lang === 'it' ? 'DETTAGLI DI SCAVO & REPERTI' : 'EXCAVATION ARCHIVES & FINDINGS'}</span>
                  </h4>
                  <ul className="space-y-3 text-[12px] text-[#1C1C1C] font-serif" id="tappa-findings-ul">
                    {(lang === 'it' ? activeTappa.details : activeTappa.detailsEn).map((detail, idx) => (
                      <li key={idx} className="flex gap-2">
                        <span className="w-1 h-1 bg-[#1C1C1C] mt-2 shrink-0"></span>
                        <p className="leading-relaxed text-[#1C1C1C]/90 font-serif italic">{detail}</p>
                      </li>
                    ))}
                  </ul>
                </div>

              </div>

              {/* Pager footer for cycling stops */}
              <div className="border-t border-[#D1CEC7] p-3 bg-[#FAF9F6] flex items-center justify-between" id="navigation-stops-pager">
                <button
                  id="btn-prev-stop"
                  disabled={activeTappaId === 1}
                  onClick={() => handleSelectTappa(activeTappaId - 1)}
                  className={`px-3 py-1.5 rounded-none border text-[11px] font-sans uppercase tracking-wider font-bold flex items-center gap-1 transition-all ${
                    activeTappaId === 1 
                      ? 'border-gray-200 text-gray-300 pointer-events-none bg-[#FAF9F6]' 
                      : 'border-[#D1CEC7] hover:border-[#1C1C1C] text-[#1C1C1C] bg-[#FAF9F6] cursor-pointer'
                  }`}
                >
                  ◀ {lang === 'it' ? 'Precedente' : 'Previous'}
                </button>
                <span className="text-xs font-mono font-bold text-[#8B8378]">
                  {activeTappaId} / {TAPPE.length}
                </span>
                <button
                  id="btn-next-stop"
                  disabled={activeTappaId === TAPPE.length}
                  onClick={() => handleSelectTappa(activeTappaId + 1)}
                  className={`px-3 py-1.5 rounded-none border text-[11px] font-sans uppercase tracking-wider font-bold flex items-center gap-1 transition-all ${
                    activeTappaId === TAPPE.length 
                      ? 'border-gray-200 text-gray-300 pointer-events-none bg-[#FAF9F6]' 
                      : 'border-[#D1CEC7] hover:border-[#1C1C1C] text-[#1C1C1C] bg-[#FAF9F6] cursor-pointer'
                  }`}
                >
                  {lang === 'it' ? 'Successiva' : 'Next'} ▶
                </button>
              </div>

            </div>
          </div>

        </section>

        {/* RIGHT COLUMN: TIMELINE / SELECTOR HUB (4 COLS ON DESKTOP) */}
        <section className="lg:col-span-4 flex flex-col gap-6" id="section-timeline-guided-info">
          
          {/* TOUR ITINERARY DIRECTORY MAP CARD */}
          <div className="bg-[#FAF9F6] border border-[#D1CEC7] rounded-none shadow-none p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <div className="w-[3px] h-5 bg-[#1C1C1C]"></div>
              <h2 className="text-sm font-sans font-bold tracking-[0.2em] text-[#1C1C1C] uppercase">
                {lang === 'it' ? 'Tappe del Percorso' : 'Tour Itinerary'}
              </h2>
            </div>
            
            <p className="text-xs text-[#8B8378] font-serif italic -mt-2 leading-relaxed">
              {lang === 'it' ? 'Esplora il tracciato monumentale nell\'ordine suggerito dagli scavi.' : 'Explore the monumental guide structured in chronological sequencing.'}
            </p>

            <div className="flex flex-col gap-2.5" id="itinerary-stops-list">
              {TAPPE.map((t) => {
                const isActive = t.id === activeTappaId;
                return (
                  <button
                    key={t.id}
                    id={`stop-btn-${t.id}`}
                    onClick={() => handleSelectTappa(t.id)}
                    className={`w-full p-3 rounded-none border text-left transition-all flex items-center gap-3 cursor-pointer ${
                      isActive 
                        ? 'border-[#1C1C1C] bg-[#EFECE6]/40 shadow-xs' 
                        : 'border-[#D1CEC7]/60 hover:border-[#1C1C1C] bg-transparent'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-none flex items-center justify-center font-sans font-bold text-xs shrink-0 transition-transform ${
                      isActive ? 'bg-[#1C1C1C] text-[#FAF9F6]' : 'bg-[#EFECE6] text-[#8B8378]'
                    }`}>
                      {t.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-xs font-sans uppercase tracking-wide font-bold truncate ${isActive ? 'text-[#1C1C1C]' : 'text-slate-800'}`}>
                        {lang === 'it' ? t.title : t.titleEn}
                      </div>
                      <div className="text-[10px] text-[#8B8378] font-serif italic uppercase mt-0.5 tracking-wider">
                        {t.era} • {lang === 'it' ? t.locationDetails : t.locationDetailsEn}
                      </div>
                    </div>
                    <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform ${isActive ? 'text-[#1C1C1C] translate-x-0.5' : 'text-slate-400'}`} />
                  </button>
                );
              })}
            </div>
          </div>

          {/* GUIDED SUMMER TOURS INFORMATION FRAME (From poster attachment) */}
          <div className="bg-[#FAF9F6] text-[#1C1C1C] border border-[#D1CEC7] rounded-none shadow-none p-5 flex flex-col gap-4 relative overflow-hidden">
            <div className="flex items-center gap-2 border-b border-[#D1CEC7] pb-2">
              <Calendar className="w-4 h-4 text-[#8B8378]" />
              <h2 className="text-xs font-sans font-bold tracking-[0.2em] text-[#1C1C1C] uppercase">
                {lang === 'it' ? 'VISITE ACCOMPAGNATE 2026' : 'ACCOMPANIED TOURS 2026'}
              </h2>
            </div>

            <div>
              <h3 className="text-lg font-display-serif font-black text-[#1C1C1C]">
                {lang === 'it' ? 'Alla Scoperta di Vitruvio' : 'Discovering Vitruvius'}
              </h3>
              <p className="text-[11px] text-[#8B8378] font-serif italic leading-relaxed mt-1">
                {lang === 'it' 
                  ? 'Visite guidate e assistite al patrimonio archeologico di Fanum Fortunae dal 20 Giugno 2026.' 
                  : 'Guided tours and assistances to the archeological relics of Fanum Fortunae from June 20, 2026.'}
              </p>
            </div>

            <div className="space-y-4 pt-2" id="tour-types-list">
              {TOURS_POSTER_INFO.map((tour, index) => (
                <div key={index} className="text-xs bg-[#EFECE6]/40 p-3 rounded-none border border-[#D1CEC7]">
                  <div className="font-sans uppercase tracking-wider font-extrabold text-[#1C1C1C] text-[11px] flex items-center justify-between gap-1 mb-2 bg-[#EFECE6] px-2 py-1 border-b border-[#D1CEC7]">
                    <span>{lang === 'it' ? tour.type : tour.typeEn}</span>
                    <span className="text-[#8B8378] font-mono font-bold">{tour.price}</span>
                  </div>
                  
                  <div className="text-[11px] text-[#1C1C1C] font-serif italic mb-1.5 flex items-center gap-1.5">
                    <Clock className="w-3 h-3 text-[#8B8378] shrink-0" />
                    <span>{(lang === 'it' ? tour.schedule : tour.scheduleEn).join(" ")}</span>
                  </div>
                  
                  <div className="text-[10px] text-[#8B8378] font-mono flex items-center gap-1 border-b border-[#D1CEC7]/30 pb-1.5 mb-1.5">
                    <span>{lang === 'it' ? 'Durata' : 'Duration'}: {lang === 'it' ? tour.duration : tour.durationEn}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="text-[9px] font-sans font-bold uppercase tracking-wider text-[#8B8378]">{lang === 'it' ? 'Tappe del percorso guidato' : 'Stops of the guided path'}</div>
                    <ul className="space-y-0.5 text-[10px] text-[#1C1C1C]/90 font-serif">
                      {tour.stops.map((stop, stopIdx) => (
                        <li key={stopIdx} className="flex gap-1 items-center italic">
                          <Check className="w-3 h-3 text-[#8B8378] shrink-0" />
                          <span className="truncate">{stop}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>

            {/* Official booking details */}
            <div className="text-[11px] text-[#1C1C1C] space-y-2 border-t border-[#D1CEC7] pt-3 font-serif" id="booking-details-box">
              <p className="leading-relaxed">
                🏛️ <strong>{lang === 'it' ? 'Partenza' : 'Departure'}:</strong> {lang === 'it' ? GENERAL_INFO.departure.it : GENERAL_INFO.departure.en}
              </p>
              <p className="leading-relaxed">
                🎟️ <strong>{lang === 'it' ? 'Biglietti / Info' : 'Tickets / Reservations'}:</strong> {lang === 'it' ? GENERAL_INFO.booking.it : GENERAL_INFO.booking.en}
              </p>
            </div>

            {/* Contact details */}
            <div className="bg-[#FAF9F6] p-3 rounded-none border border-[#D1CEC7] text-[11px] text-[#1C1C1C] flex flex-col gap-1.5 font-mono">
              <div className="flex items-center gap-2">
                <Phone className="w-3.5 h-3.5 text-[#8B8378]" />
                <span>{GENERAL_INFO.contacts.phone}</span>
              </div>
              <div className="flex items-center gap-2">
                <Mail className="w-3.5 h-3.5 text-[#8B8378]" />
                <span>{GENERAL_INFO.contacts.email}</span>
              </div>
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[#8B8378]" />
                <a href={`http://${GENERAL_INFO.contacts.web}`} target="_blank" rel="noreferrer" className="underline hover:text-[#8B8378]">
                  {GENERAL_INFO.contacts.web}
                </a>
              </div>
            </div>
          </div>

        </section>
      </main>

      {/* ARRIVED AT TAPPA CONGRATULATORY ALERT / MODAL */}
      {arrivedAlert && (
        <div className="fixed inset-0 bg-[#1C1C1C]/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn" id="arrived-modal-backdrop">
          <div className="bg-[#FAF9F6] rounded-none border border-[#1C1C1C] max-w-sm w-full p-6 text-center shadow-lg relative animate-scaleIn" id="arrived-modal-inside">
            <div className="w-12 h-12 bg-[#FAF9F6] text-[#1C1C1C] rounded-none flex items-center justify-center mx-auto mb-4 border border-[#D1CEC7]">
              <Sparkles className="w-6 h-6 text-[#8B8378] animate-spin-slow" />
            </div>
            
            <h3 className="text-lg font-display-serif font-black text-[#1C1C1C] uppercase tracking-wide">
              {lang === 'it' ? 'Tappa Raggiunta' : 'Stop Reached'}
            </h3>
            
            <p className="text-3xl font-display font-bold text-[#8B8378] my-1">
              #{activeTappa.number}
            </p>

            <h4 className="text-sm font-sans font-bold uppercase tracking-wider text-[#1C1C1C] leading-tight">
              {lang === 'it' ? activeTappa.title : activeTappa.titleEn}
            </h4>

            <p className="text-xs text-[#8B8378] font-serif italic mt-2.5 leading-relaxed">
              {lang === 'it' 
                ? 'Sei appena giunto sul luogo d\'interesse. L\'audioguida ha avviato automaticamente la lettura della descrizione storica dell\'area.'
                : 'You have arrived. The speech voice guide has automatically started reading details of this archaeological location.'}
            </p>

            <div className="mt-5">
              <button
                id="btn-close-arrive-alert"
                onClick={closeArrivedAlert}
                className="w-full py-2 bg-[#1C1C1C] hover:bg-[#8B8378] text-[#FAF9F6] font-sans font-bold text-xs tracking-widest uppercase transition-all cursor-pointer rounded-none border border-[#1C1C1C]"
              >
                {lang === 'it' ? 'LEGGI E CHIUDI' : 'READ & CLOSE'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLYER / INSEGNA INFORMATIVA MODAL (FANO SIGN PANEL & PRINTABLE QR CODE FLYER) */}
      {showQRModal && (
        <div className="fixed inset-0 bg-[#1C1C1C]/60 backdrop-blur-md flex items-center justify-center p-4 z-50 overflow-y-auto" id="qr-modal-backdrop">
          <div className="bg-[#FAF9F6] rounded-none border border-[#1C1C1C] max-w-3xl w-full flex flex-col md:flex-row shadow-lg overflow-hidden animate-scaleIn my-4" id="qr-modal-inside">
            
            {/* FLYER VISUAL PRINT-BANNER PANEL - Left Side */}
            <div className="flex-1 bg-[#1C1C1C] text-[#FAF9F6] p-6 flex flex-col justify-between border-b md:border-b-0 md:border-r border-[#D1CEC7] relative overflow-hidden">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="bg-[#1C1C1C] border border-[#FAF9F6] px-2 py-0.5 text-[#FAF9F6] font-mono text-[9px] tracking-widest uppercase">
                    FANO ARCHEO MASTHEAD
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-display-serif font-black text-[#FAF9F6] uppercase tracking-tight leading-tighter">
                    TABELLA INFORMATIVA <br/>MUSEO PALAZZO MALATESTIANO
                  </h3>
                  <p className="text-xs text-[#FAF9F6]/80 font-serif italic leading-relaxed mt-2.5">
                    {lang === 'it' 
                      ? 'Questo pannello rappresenta la locandina informativa pubblica con il QR-Code allestita presso il Museo del Palazzo Malatestiano - Sala Morganti (dove si trova la biglietteria di partenza). I visitatori scansionano il codice per aprire la guida geolocalizzata sul proprio cellulare.' 
                      : 'This panel represents the public information signboard designed for the Museo del Palazzo Malatestiano - Sala Morganti (located at the departures ticket office). Visitors scan the code to load the geolocalized tour guide on their phones.'}
                  </p>
                </div>

                {/* Poster information highlights */}
                <div className="bg-[#FAF9F6]/5 p-4 rounded-none border border-[#FAF9F6]/10 space-y-3">
                  <h4 className="text-[10px] font-sans font-bold uppercase text-[#8B8378] tracking-widest">
                    {lang === 'it' ? 'Istruzioni per l\'Uso' : 'Usage Steps'}
                  </h4>
                  <ol className="space-y-2 text-xs text-[#FAF9F6]/90 font-serif list-decimal list-inside">
                    <li>{lang === 'it' ? "Scansiona il QR con la fotocamera del cellulare" : "Scan the QR code with your smartphone camera"}</li>
                    <li>{lang === 'it' ? "Consenti al browser l'accesso GPS per orientarti" : "Allow browser GPS location to orient yourself"}</li>
                    <li>{lang === 'it' ? "Segui l'itinerario e ascolta gli scavi archeologici" : "Follow the route map and listen to archeo guides"}</li>
                  </ol>
                </div>
              </div>

              {/* Poster footprint */}
              <div className="pt-6 border-t border-[#FAF9F6]/10 text-[10px] text-[#FAF9F6]/60 font-mono flex items-center justify-between mt-4">
                <span>COMUNE DI FANO</span>
                <span>© TOUR VITRUVIO 2026</span>
              </div>
            </div>

            {/* FLYER SCHEDULER & REAL QR-CODE ENGINE - Right Side */}
            <div className="bg-[#FAF9F6] p-6 md:p-8 w-full md:w-[380px] flex flex-col items-center justify-start text-center gap-4 relative overflow-y-auto max-h-[90vh]">
              <div>
                <h4 className="text-[10px] font-sans font-bold text-[#8B8378] uppercase tracking-widest">{lang === 'it' ? 'Scansiona il Codice' : 'Scan the QR Code'}</h4>
                <p className="text-xs text-[#1C1C1C] font-serif italic mt-1">{lang === 'it' ? 'Inquadra con la fotocamera' : 'Use your smartphone camera'}</p>
              </div>

              {/* The Live Interactive QR Code */}
              <div className="p-4 bg-[#FAF9F6] border border-[#D1CEC7] rounded-none shadow-none relative group flex flex-col items-center" id="qr-element-container">
                <QRCodeSVG
                  value={currentAppUrl}
                  size={150}
                  level="H"
                  includeMargin={true}
                  imageSettings={{
                    src: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png", // Leaflet marker inside center!
                    x: undefined,
                    y: undefined,
                    height: 24,
                    width: 16,
                    excavate: true,
                  }}
                />
                
                {/* Visual frame anchor lines */}
                <span className="absolute top-2 left-2 w-4 h-4 border-t border-l border-[#1C1C1C]"></span>
                <span className="absolute top-2 right-2 w-4 h-4 border-t border-r border-[#1C1C1C]"></span>
                <span className="absolute bottom-2 left-2 w-4 h-4 border-b border-l border-[#1C1C1C]"></span>
                <span className="absolute bottom-2 right-2 w-4 h-4 border-b border-r border-[#1C1C1C]"></span>
              </div>

              {/* Dynamic current URL address customization */}
              <div className="w-full text-left space-y-3 border-t border-b border-[#D1CEC7]/40 py-3">
                <div>
                  <div className="text-[10px] font-sans font-bold text-[#8B8378] uppercase tracking-wide mb-1">
                    {lang === 'it' ? 'URL di Destinazione del QR-code' : 'QR-Code Destination URL'}
                  </div>
                  <input
                    type="text"
                    value={currentAppUrl}
                    onChange={(e) => setCurrentAppUrl(e.target.value)}
                    className="w-full text-xs font-mono p-1.5 bg-white border border-[#D1CEC7] text-[#1C1C1C] focus:outline-none focus:border-[#1C1C1C]"
                    placeholder="https://..."
                  />
                </div>

                <div className="space-y-1">
                  <span className="block text-[9px] font-sans font-bold text-[#8B8378] uppercase">
                    {lang === 'it' ? 'Imposta in un click:' : 'Click to set:'}
                  </span>
                  <div className="flex flex-col gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentAppUrl('https://ais-pre-yfbnpmhylffdv4cfzpgfpe-537055341569.europe-west1.run.app')}
                      className={`text-[10px] text-left p-1.5 border font-sans truncate transition-all ${currentAppUrl === 'https://ais-pre-yfbnpmhylffdv4cfzpgfpe-537055341569.europe-west1.run.app' ? 'bg-[#1C1C1C] border-[#1C1C1C] text-white font-bold' : 'bg-[#EFECE6] border-[#D1CEC7] text-[#1C1C1C] hover:bg-gray-200'}`}
                    >
                      📡 {lang === 'it' ? 'Link Condiviso Pubblico (Consigliato)' : 'Public Shared Link (Recommended)'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentAppUrl('https://museocivico.comune.fano.pu.it')}
                      className={`text-[10px] text-left p-1.5 border font-sans truncate transition-all ${currentAppUrl === 'https://museocivico.comune.fano.pu.it' ? 'bg-[#1C1C1C] border-[#1C1C1C] text-white font-bold' : 'bg-[#EFECE6] border-[#D1CEC7] text-[#1C1C1C] hover:bg-gray-200'}`}
                    >
                      🏛️ {lang === 'it' ? 'Sito Museo Fano (Fisico)' : 'Museum Civico Fano (Domain)'}
                    </button>
                  </div>
                </div>

                {/* Explanatory notice */}
                <div className="bg-[#EFECE6] p-2 border border-[#D1CEC7] text-[10px] text-[#8B8378] leading-relaxed font-serif italic">
                  {lang === 'it' 
                    ? "Inquadrando il QR-code mentre modifichi il sito nell'editor, il telefono dirà che non esiste perché il server di sviluppo interno è protetto. Seleziona 'Link Condiviso Pubblico' per scansionare liberamente dal cellulare!"
                    : "When scanning the QR-code within the preview builder, your phone says unreachable due to editor security. Select the 'Public Shared Link' preset for testing directly on your phone!"}
                </div>
              </div>

              <div className="w-full space-y-1.5">
                <button
                  id="btn-print-qr-sign"
                  onClick={() => window.print()}
                  className="w-full py-2 bg-[#1C1C1C] hover:bg-[#8B8378] text-[#FAF9F6] font-sans font-bold rounded-none text-[10px] tracking-wider uppercase flex items-center justify-center gap-1.5 transition-all cursor-pointer border border-[#1C1C1C]"
                >
                  <Printer className="w-3.5 h-3.5" />
                  {lang === 'it' ? 'Stampa Insegna' : 'Print Signboard'}
                </button>
                <button
                  id="btn-close-qr-modal"
                  onClick={() => setShowQRModal(false)}
                  className="w-full py-2 bg-[#FAF9F6] hover:bg-[#EFECE6] text-[#1C1C1C] border border-[#D1CEC7] font-sans font-bold rounded-none text-[10px] tracking-wider uppercase transition-all cursor-pointer"
                >
                  {lang === 'it' ? 'Chiudi Finestra' : 'Close Window'}
                </button>
              </div>
            </div>

          </div>
        </div>
      )}

      {/* COMPACT FOOTER */}
      <footer className="border-t-[3px] border-b border-[#1C1C1C] my-4 py-5 px-4 text-center text-xs text-[#1C1C1C] max-w-7xl mx-auto w-full" id="app-footer">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="text-left font-serif">
            <p className="font-bold"><strong>Tour Vitruvio Fano</strong> • {lang === 'it' ? 'Sito di appoggio archeologico' : 'Archaeological companion guide'}</p>
            <p className="text-[10.5px] text-[#8B8378] italic mt-1 font-serif">
              {lang === 'it' 
                ? 'Monografia digitale progettata esclusivamente sulla base della documentazione scientifica e degli scavi di Piazza Andrea Costa.'
                : 'Digital monograph engineered entirely on strict scientific documentations of the Piazza Andrea Costa excavations.'}
            </p>
          </div>
          <div className="text-[#8B8378] text-[10.5px] font-mono tracking-wide uppercase">
            {lang === 'it' ? 'Sorgente dati' : 'Source data'}: Fano Piazza Andrea Costa / Alla scoperta di Vitruvio 2026
          </div>
        </div>
      </footer>

    </div>
  );
}
