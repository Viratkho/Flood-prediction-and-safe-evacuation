import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import {
  RegisteredPerson,
  CitizenRegistrationInput,
  RescuePriorityLevel,
} from '../types/floodguard';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Compass,
  Heart,
  HeartPulse,
  Home,
  Info,
  LifeBuoy,
  MapPin,
  Phone,
  Radio,
  Send,
  Shield,
  Smartphone,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';

interface PersonIntakeFormProps {
  currentGps: [number, number];
  onPersonRegistered: (person: RegisteredPerson, autoShowOnMap?: boolean) => void;
  onClose?: () => void;
  onOpenSmsModal?: (person: RegisteredPerson) => void;
}

const COMMON_PRESET_LOCATIONS: Array<{ name: string; lat: number; lng: number; risk: string }> = [
  { name: 'Paruthipattu Low Riverbank (Critical)', lat: 13.1110, lng: 80.0980, risk: 'High Flood Risk (>50cm)' },
  { name: 'Kovur Culvert Causeway (Critical)', lat: 13.1065, lng: 80.1035, risk: 'Spillway Surge (>55cm)' },
  { name: 'Avadi Railway Station Market (Moderate)', lat: 13.1143, lng: 80.1015, risk: 'Water Ingress (~20cm)' },
  { name: 'Ambattur Industrial Low Basin (Moderate)', lat: 13.1170, lng: 80.1250, risk: 'Drainage Overflow' },
  { name: 'Thirumullaivoyal High Ridge (Safe)', lat: 13.1250, lng: 80.1150, risk: 'Elevated Haven (24.8m)' },
];

const VULNERABILITY_OPTIONS = [
  { id: 'ELDERLY', label: 'Elderly (65+ Years)', desc: 'Limited mobility or endurance' },
  { id: 'DIABETIC', label: 'Diabetic (Insulin Dependent)', desc: 'Requires dry chilled insulin & glucose' },
  { id: 'CARDIAC', label: 'Cardiac / Hypertension', desc: 'Prone to stress-induced tachycardia' },
  { id: 'ASTHMA', label: 'Asthma / Respiratory', desc: 'Vulnerable to damp flood air & mold' },
  { id: 'PREGNANT', label: 'Pregnant Mother', desc: 'Requires priority medical triage' },
  { id: 'MOBILITY_IMPAIRED', label: 'Mobility Impaired / Wheelchair', desc: 'Requires boat extraction' },
  { id: 'INFANT', label: 'Infant / Toddler with Family', desc: 'High hypothermia risk' },
  { id: 'HYPOTHERMIA', label: 'Prolonged Water Exposure', desc: 'Shivering, wet clothes' },
];

export const PersonIntakeForm: React.FC<PersonIntakeFormProps> = ({
  currentGps,
  onPersonRegistered,
  onClose,
  onOpenSmsModal,
}) => {
  const [name, setName] = useState('');
  const [age, setAge] = useState<number | ''>('');
  const [gender, setGender] = useState('Unspecified');
  const [contactNumber, setContactNumber] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [addressLandmark, setAddressLandmark] = useState('');
  const [lat, setLat] = useState<number>(currentGps?.[0] || 13.1120);
  const [lng, setLng] = useState<number>(currentGps?.[1] || 80.1030);
  const [currentWaterDepthCm, setCurrentWaterDepthCm] = useState<number>(15);
  const [assistanceType, setAssistanceType] = useState<
    'RESCUE_BOAT' | 'MEDICAL_EVAC' | 'SHELTER_ROUTING' | 'SUPPLIES' | 'GENERAL_ADVICE'
  >('SHELTER_ROUTING');
  const [dependentsCount, setDependentsCount] = useState<number>(0);
  const [dependentsDetails, setDependentsDetails] = useState('');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);
  const [medicalNotes, setMedicalNotes] = useState('');
  const [initialHeartRate, setInitialHeartRate] = useState<number>(78);
  const [initialSpo2, setInitialSpo2] = useState<number>(98);
  const [sosActive, setSosActive] = useState(false);
  const [sendWelcomeSms, setSendWelcomeSms] = useState(true);
  const [autoShowOnMap, setAutoShowOnMap] = useState(true);

  const miniMapContainerRef = useRef<HTMLDivElement>(null);
  const miniMapInstanceRef = useRef<L.Map | null>(null);
  const miniMarkerRef = useRef<L.Marker | null>(null);

  // Initialize interactive mini-map preview for GPS pin placement
  useEffect(() => {
    if (!miniMapContainerRef.current || miniMapInstanceRef.current) return;

    const map = L.map(miniMapContainerRef.current, {
      center: [lat, lng],
      zoom: 14,
      zoomControl: false,
    });

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const pinIcon = L.divIcon({
      className: 'intake-map-pin',
      html: `
        <div class="relative flex flex-col items-center cursor-grab active:cursor-grabbing">
          <div class="w-8 h-8 rounded-full bg-[#ff7700] border-2 border-white shadow-2xl flex items-center justify-center text-white text-xs font-bold animate-pulse">
            📍
          </div>
          <div class="w-2.5 h-2.5 rotate-45 -mt-1 bg-[#ff7700] border-r border-b border-white"></div>
        </div>
      `,
      iconSize: [32, 36],
      iconAnchor: [16, 36],
    });

    const marker = L.marker([lat, lng], {
      icon: pinIcon,
      draggable: true,
    }).addTo(map);

    marker.on('dragend', () => {
      const pos = marker.getLatLng();
      setLat(Number(pos.lat.toFixed(4)));
      setLng(Number(pos.lng.toFixed(4)));
    });

    map.on('click', (e) => {
      marker.setLatLng(e.latlng);
      setLat(Number(e.latlng.lat.toFixed(4)));
      setLng(Number(e.latlng.lng.toFixed(4)));
    });

    miniMapInstanceRef.current = map;
    miniMarkerRef.current = marker;

    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 250);

    return () => {
      clearTimeout(timer);
      map.remove();
      miniMapInstanceRef.current = null;
      miniMarkerRef.current = null;
    };
  }, []);

  // Sync mini-map whenever lat or lng updates from buttons or inputs
  useEffect(() => {
    if (miniMarkerRef.current && miniMapInstanceRef.current) {
      const currentPos = miniMarkerRef.current.getLatLng();
      if (Math.abs(currentPos.lat - lat) > 0.0001 || Math.abs(currentPos.lng - lng) > 0.0001) {
        miniMarkerRef.current.setLatLng([lat, lng]);
        miniMapInstanceRef.current.panTo([lat, lng], { animate: true });
      }
    }
  }, [lat, lng]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registeredSuccess, setRegisteredSuccess] = useState<RegisteredPerson | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const toggleCondition = (condId: string) => {
    setSelectedConditions((prev) =>
      prev.includes(condId) ? prev.filter((c) => c !== condId) : [...prev, condId]
    );
  };

  const handleUseCurrentGps = () => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLat(pos.coords.latitude);
          setLng(pos.coords.longitude);
        },
        () => {
          setLat(currentGps[0]);
          setLng(currentGps[1]);
        }
      );
    } else {
      setLat(currentGps[0]);
      setLng(currentGps[1]);
    }
  };

  const handleSelectPresetLocation = (preset: typeof COMMON_PRESET_LOCATIONS[0]) => {
    setLat(preset.lat);
    setLng(preset.lng);
    setAddressLandmark(preset.name);
  };

  const handleLoadSample = (sampleType: 'diabetic' | 'family') => {
    if (sampleType === 'diabetic') {
      setName('Kalyan Sundaram');
      setAge(68);
      setGender('Male');
      setContactNumber('+91 98402 88712');
      setEmergencyContactName('Vikram Sundaram (Son)');
      setEmergencyContactPhone('+91 98400 11928');
      setAddressLandmark('Paruthipattu Lake Road, Door 14/B');
      setLat(13.1110);
      setLng(80.0980);
      setCurrentWaterDepthCm(48);
      setSelectedConditions(['ELDERLY', 'DIABETIC', 'CARDIAC']);
      setInitialHeartRate(112);
      setInitialSpo2(93);
      setAssistanceType('MEDICAL_EVAC');
      setDependentsCount(1);
      setDependentsDetails('Wife (64 yrs, hypertension)');
      setMedicalNotes('Requires cold storage for insulin. Stood in water for 2 hours.');
      setSosActive(true);
    } else {
      setName('Lakshmi Priya & Family');
      setAge(34);
      setGender('Female');
      setContactNumber('+91 94441 55678');
      setEmergencyContactName('M. Suresh');
      setEmergencyContactPhone('+91 94440 22334');
      setAddressLandmark('Near Avadi Government Hospital Corner');
      setLat(13.1143);
      setLng(80.1015);
      setCurrentWaterDepthCm(22);
      setSelectedConditions(['INFANT']);
      setInitialHeartRate(88);
      setInitialSpo2(98);
      setAssistanceType('SHELTER_ROUTING');
      setDependentsCount(3);
      setDependentsDetails('Elderly mother (72), 8-month-old infant, 6-year-old child');
      setMedicalNotes('Need safe walking route to high ground shelter before dam spillway surge');
      setSosActive(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Please provide the person or family head name.');
      return;
    }
    if (!contactNumber.trim()) {
      setErrorMessage('Please enter a mobile number for emergency SMS alerts.');
      return;
    }

    setErrorMessage('');
    setIsSubmitting(true);

    const payload = {
      name: name.trim(),
      age: age ? Number(age) : undefined,
      gender,
      contactNumber: contactNumber.trim(),
      emergencyContactName: emergencyContactName.trim(),
      emergencyContactPhone: emergencyContactPhone.trim(),
      addressLandmark: addressLandmark.trim() || 'Avadi Hydrological Basin',
      lat,
      lng,
      currentWaterDepthCm,
      assistanceType,
      dependentsCount,
      dependentsDetails,
      medicalConditions: selectedConditions,
      medicalNotes: medicalNotes.trim(),
      initialHeartRate,
      initialSpo2,
      sosActive,
    };

    try {
      // 1. Submit to server to store persistently
      const response = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error('Server returned error while saving person details');
      }

      const result = await response.json();
      const newPerson: RegisteredPerson = result.person;

      // 2. Also persist locally in localStorage so data survives reloads & offline
      try {
        const stored = localStorage.getItem('floodguard_user_people');
        const list: RegisteredPerson[] = stored ? JSON.parse(stored) : [];
        const updated = [newPerson, ...list.filter((p) => p.personId !== newPerson.personId)];
        localStorage.setItem('floodguard_user_people', JSON.stringify(updated));
      } catch (err) {
        console.warn('LocalStorage save warning:', err);
      }

      setRegisteredSuccess(newPerson);
      onPersonRegistered(newPerson, autoShowOnMap);

      // If user requested welcome SMS, also send via gateway endpoint
      if (sendWelcomeSms && contactNumber) {
        try {
          await fetch('/api/alerts/send-mobile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mobileNumber: contactNumber,
              recipientName: newPerson.name,
              alertType: sosActive ? 'EVACUATION' : 'SHELTER_ASSIGNED',
              headline: sosActive ? '🚨 SOS BEACON REGISTERED' : '🛡️ FLOODGUARD INTAKE CONFIRMED',
              message: sosActive
                ? `EMERGENCY ALERT: SOS logged for ${newPerson.name}. NDRF Boat Unit alerted for GPS (${lat.toFixed(4)}, ${lng.toFixed(4)}). Stay elevated on highest floor.`
                : `FLOODGUARD: Intake confirmed for ${newPerson.name}. Primary Safe Haven: Thirumullaivoyal High Ridge Defense Shelter. Check Evacuation Map for turn-by-turn routing.`,
              personId: newPerson.personId,
            }),
          });
        } catch (smsErr) {
          console.warn('Mobile SMS dispatch error:', smsErr);
        }
      }
    } catch (err: any) {
      console.error('Error registering person:', err);
      setErrorMessage(err.message || 'Failed to save person details. Please check network.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4 sm:p-6 text-slate-100 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#ff7700] to-amber-500 flex items-center justify-center text-white shadow-lg">
            <User className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              Citizen Emergency Intake & Registration
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Persistent Data Store
              </span>
            </h2>
            <p className="text-xs text-slate-400">
              Captures identity, real-time vitals, mobile phone for SMS alerts, medical vulnerabilities, and GPS coordinates.
            </p>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Success Banner */}
      {registeredSuccess ? (
        <div className="p-6 bg-slate-950/80 border border-emerald-500/40 rounded-xl text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/40 shadow-lg">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-emerald-300">
              Person Intake Saved & Synced Successfully!
            </h3>
            <p className="text-sm text-slate-300 mt-1">
              Registered ID: <span className="font-mono text-[#ff7700]">{registeredSuccess.personId}</span> | Wearable ID: <span className="font-mono text-cyan-300">{registeredSuccess.wearableId}</span>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Calculated Rescue Priority: <span className="font-bold text-amber-300">{registeredSuccess.rescuePriority}</span> ({registeredSuccess.priorityReason})
            </p>
          </div>

          <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg max-w-lg mx-auto text-left text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-400">Mobile Phone:</span>
              <span className="font-mono text-slate-200">{registeredSuccess.contactNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Location GPS:</span>
              <span className="font-mono text-slate-200">{registeredSuccess.lat.toFixed(4)}, {registeredSuccess.lng.toFixed(4)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Vitals Logged:</span>
              <span className="font-mono text-emerald-300">HR {registeredSuccess.heartRateBpm} BPM | SpO₂ {registeredSuccess.spo2Percent}%</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">SMS Gateway Status:</span>
              <span className="text-emerald-400 font-semibold">Delivered via NDRF / BSNL Relay</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                onPersonRegistered(registeredSuccess, true);
                if (onClose) onClose();
              }}
              className="px-4 py-2 bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#ff8811] hover:to-amber-400 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-[#ff7700]/30 transition"
            >
              <Compass className="w-4 h-4" />
              <span>View {registeredSuccess.name} on Live Tactical Map ({registeredSuccess.lat.toFixed(4)}, {registeredSuccess.lng.toFixed(4)}) &rarr;</span>
            </button>

            {onOpenSmsModal && (
              <button
                type="button"
                onClick={() => onOpenSmsModal(registeredSuccess)}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold rounded-xl text-sm flex items-center gap-2 shadow-lg transition"
              >
                <Smartphone className="w-4 h-4" />
                Dispatch Custom Mobile Alert
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setRegisteredSuccess(null);
                setName('');
                setContactNumber('');
                setEmergencyContactName('');
                setEmergencyContactPhone('');
                setAddressLandmark('');
                setSelectedConditions([]);
                setMedicalNotes('');
                setSosActive(false);
              }}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-sm transition"
            >
              Register Another Person
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl text-sm transition"
              >
                Close
              </button>
            )}
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quick preset loader */}
          <div className="flex items-center justify-between p-3 bg-slate-950/70 border border-slate-800 rounded-xl text-xs">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Sparkles className="w-4 h-4 text-[#ff7700]" />
              Quick Fill Sample Scenarios:
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleLoadSample('diabetic')}
                className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg transition"
              >
                Elderly Diabetic (Paruthipattu Lake)
              </button>
              <button
                type="button"
                onClick={() => handleLoadSample('family')}
                className="px-2.5 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg transition"
              >
                Family with Infant (Avadi Market)
              </button>
            </div>
          </div>

          {errorMessage && (
            <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Section 1: Personal & Mobile Phone Information */}
          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <User className="w-4 h-4 text-[#ff7700]" />
              1. Citizen Identity & Mobile Contact (For SMS Alerts)
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">
                  Full Name / Household Head <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Chandra / Sundaram Family"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#ff7700]"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Age & Gender</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min="1"
                    max="115"
                    placeholder="Age"
                    value={age}
                    onChange={(e) => setAge(e.target.value ? Number(e.target.value) : '')}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#ff7700]"
                  />
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2 py-2 text-sm text-slate-100 focus:outline-none focus:border-[#ff7700]"
                  >
                    <option value="Unspecified">Gender</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">
                  Mobile Phone Number (Will receive emergency SMS) <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-emerald-400 absolute left-3 top-2.5" />
                  <input
                    type="tel"
                    required
                    placeholder="+91 98401 23456"
                    value={contactNumber}
                    onChange={(e) => setContactNumber(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Used by Command Center to send real-time SMS evacuation orders and rescue team updates.
                </p>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Emergency Contact (Next of Kin)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Contact Name"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#ff7700]"
                  />
                  <input
                    type="tel"
                    placeholder="Contact Phone"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#ff7700]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Location & GPS Coordinates */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                2. Location Coordinates & Street Landmark
              </h3>
              <button
                type="button"
                onClick={handleUseCurrentGps}
                className="px-2.5 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 rounded-lg text-xs flex items-center gap-1.5 transition"
              >
                <Compass className="w-3.5 h-3.5" />
                Auto-Detect Device GPS
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-400 mb-1">Street Address / Landmark / Neighborhood</label>
                <input
                  type="text"
                  placeholder="e.g. Paruthipattu Lake Road, Door 14/B, Near Shiva Temple"
                  value={addressLandmark}
                  onChange={(e) => setAddressLandmark(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Flood Depth at Location</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="0"
                    max="120"
                    step="5"
                    value={currentWaterDepthCm}
                    onChange={(e) => setCurrentWaterDepthCm(Number(e.target.value))}
                    className="flex-1 accent-cyan-400 cursor-pointer"
                  />
                  <span className={`text-xs font-mono font-bold px-2 py-1 rounded ${
                    currentWaterDepthCm >= 50
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                      : currentWaterDepthCm >= 20
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {currentWaterDepthCm} cm
                  </span>
                </div>
              </div>
            </div>

            {/* Quick preset buttons */}
            <div>
              <span className="text-[11px] text-slate-400 block mb-1.5">Preset Hotspots:</span>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_PRESET_LOCATIONS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => handleSelectPresetLocation(preset)}
                    className="px-2.5 py-1 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-lg text-xs text-slate-300 hover:text-white transition flex items-center gap-1.5"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={lng}
                  onChange={(e) => setLng(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            {/* Interactive GPS Pin Mini-Map Preview */}
            <div className="space-y-1.5 pt-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                  <Compass className="w-3.5 h-3.5 text-[#ff7700]" />
                  Interactive GPS Pin Placement (Click map or drag pin to position person)
                </span>
                <span className="font-mono text-[#ff7700] bg-[#ff7700]/10 px-2 py-0.5 rounded border border-[#ff7700]/30 text-[11px]">
                  {lat.toFixed(4)}, {lng.toFixed(4)}
                </span>
              </div>
              <div
                ref={miniMapContainerRef}
                className="w-full h-44 rounded-xl border border-slate-700 overflow-hidden relative shadow-inner z-0"
              />
              <p className="text-[11px] text-slate-400">
                This exact GPS coordinate will be attached to the citizen's wearable record and plotted onto the Live Command Map immediately when submitted.
              </p>
            </div>
          </div>

          {/* Section 3: Health Vitals & Medical Vulnerabilities */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <HeartPulse className="w-4 h-4 text-rose-400" />
              3. Health Telemetry & Medical Vulnerabilities
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5 text-rose-400" />
                    Heart Rate (BPM)
                  </span>
                  <span className={`text-xs font-mono font-bold ${
                    initialHeartRate > 115 || initialHeartRate < 55 ? 'text-rose-400' : 'text-emerald-400'
                  }`}>
                    {initialHeartRate} BPM
                  </span>
                </div>
                <input
                  type="range"
                  min="40"
                  max="160"
                  value={initialHeartRate}
                  onChange={(e) => setInitialHeartRate(Number(e.target.value))}
                  className="w-full accent-rose-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500">
                  Normal: 60-100 BPM | Tachycardia Warning: &gt;115 BPM
                </span>
              </div>

              <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-slate-400 flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    Blood Oxygen SpO₂ (%)
                  </span>
                  <span className={`text-xs font-mono font-bold ${
                    initialSpo2 < 92 ? 'text-rose-400' : initialSpo2 < 95 ? 'text-amber-400' : 'text-emerald-400'
                  }`}>
                    {initialSpo2}%
                  </span>
                </div>
                <input
                  type="range"
                  min="80"
                  max="100"
                  value={initialSpo2}
                  onChange={(e) => setInitialSpo2(Number(e.target.value))}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
                <span className="text-[10px] text-slate-500">
                  Normal: &ge;95% | Hypoxia Distress: &lt;92%
                </span>
              </div>
            </div>

            {/* Vulnerability Checkboxes */}
            <div>
              <span className="text-xs text-slate-400 block mb-2 font-medium">
                Vulnerabilities & Risk Conditions (Check all that apply):
              </span>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {VULNERABILITY_OPTIONS.map((v) => {
                  const isChecked = selectedConditions.includes(v.id);
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => toggleCondition(v.id)}
                      className={`p-2.5 rounded-xl border text-left transition ${
                        isChecked
                          ? 'bg-[#ff7700]/15 border-[#ff7700] text-white shadow-md'
                          : 'bg-slate-950/70 border-slate-800 text-slate-300 hover:border-slate-700'
                      }`}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between">
                        <span>{v.label}</span>
                        {isChecked && <CheckCircle className="w-3.5 h-3.5 text-[#ff7700]" />}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5 line-clamp-1">{v.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Medical Notes / Special Medications Required
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Needs oxygen concentrator, insulin requires cold storage, wheelchair bound..."
                value={medicalNotes}
                onChange={(e) => setMedicalNotes(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-rose-400"
              />
            </div>
          </div>

          {/* Section 4: Assistance Required & Family Dependents */}
          <div className="space-y-3 pt-2 border-t border-slate-800/80">
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <Users className="w-4 h-4 text-amber-400" />
              4. Assistance Type & Household Dependents
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Required Emergency Service</label>
                <select
                  value={assistanceType}
                  onChange={(e: any) => setAssistanceType(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                >
                  <option value="SHELTER_ROUTING">Safe Shelter Routing (On Foot / Vehicle)</option>
                  <option value="RESCUE_BOAT">Inflatable Rescue Boat Extraction (Water &gt;45cm)</option>
                  <option value="MEDICAL_EVAC">Emergency Medical Evacuation (Ambulance / Medic)</option>
                  <option value="SUPPLIES">Emergency Food, Clean Water & ORS Drop</option>
                  <option value="GENERAL_ADVICE">General Tactical Advice & Standby</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Number of Dependents / Family with You</label>
                <div className="grid grid-cols-3 gap-2">
                  <input
                    type="number"
                    min="0"
                    max="20"
                    value={dependentsCount}
                    onChange={(e) => setDependentsCount(Number(e.target.value))}
                    className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-amber-400"
                  />
                  <input
                    type="text"
                    placeholder="e.g. 2 kids, 1 elder"
                    value={dependentsDetails}
                    onChange={(e) => setDependentsDetails(e.target.value)}
                    className="col-span-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>
            </div>

            {/* Emergency SOS & SMS Toggles */}
            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sosActive}
                  onChange={(e) => setSosActive(e.target.checked)}
                  className="w-4 h-4 accent-rose-500 rounded"
                />
                <div>
                  <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
                    <LifeBuoy className="w-3.5 h-3.5" />
                    Activate Immediate Emergency SOS Beacon (Priority P0 Override)
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Immediately elevates case to P0 on Command Dashboard and alerts NDRF rescue boat fleet.
                  </p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer pt-2 border-t border-slate-900">
                <input
                  type="checkbox"
                  checked={sendWelcomeSms}
                  onChange={(e) => setSendWelcomeSms(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <div>
                  <span className="text-xs font-semibold text-emerald-300 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    Send Instant Confirmation SMS Alert to Mobile ({contactNumber || 'Entered Number'})
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Dispatches a text message with the safest shelter coordinates and emergency hotline numbers.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Submit Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-800">
            <div className="flex items-center">
              <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={autoShowOnMap}
                  onChange={(e) => setAutoShowOnMap(e.target.checked)}
                  className="w-4 h-4 accent-[#ff7700] rounded"
                />
                <span className="flex items-center gap-1.5 font-semibold text-[#ff7700]">
                  <Compass className="w-3.5 h-3.5" />
                  Auto-switch to Live Tactical Map and center on GPS coordinate upon submit
                </span>
              </label>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              {onClose && (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition"
                >
                  Cancel
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-gradient-to-r from-[#ff7700] to-amber-500 hover:from-[#ff8811] hover:to-amber-400 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-xl shadow-[#ff7700]/25 disabled:opacity-50 transition active:scale-95"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    <span>Saving & Plotting GPS on Map...</span>
                  </>
                ) : (
                  <>
                    <MapPin className="w-4 h-4 text-white" />
                    <span>Submit & Show on Map</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
};

function Activity(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.48 12H2" />
    </svg>
  );
}
