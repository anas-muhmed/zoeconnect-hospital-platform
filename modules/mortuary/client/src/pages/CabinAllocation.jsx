import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Bed, Search, Plus, X, CheckCircle, AlertTriangle, Clock, DollarSign } from 'lucide-react';

import { API_BASE } from '../config.js';

function CabinAllocation() {
  // Advance amount is an Admin-set policy value, not something Staff should
  // be able to change on the fly during allocation - Staff can see it, not
  // edit it.
  const role = localStorage.getItem('role');
  const canEditAdvance = role === 'Admin' || role === 'SuperAdmin';

  const [cabins, setCabins] = useState([]);
  const [bodies, setBodies] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [selectedCabin, setSelectedCabin] = useState(null);
  const [selectedBody, setSelectedBody] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Mirrors the shape/defaults of server/config/pricing.js's getHospitalSettings
  // fallback - kept in sync with the backend rather than hardcoding a single
  // "first day charge" number, since which field actually matters (first-day
  // flat fee vs. daily rate vs. nothing) depends on the hospital's pricing_model.
  const [settings, setSettings] = useState({
    pricing_model: 'tiered_flat_hourly',
    first_day_charge: 2100,
    hourly_charge_after_24hrs: 130,
    daily_rate: 500,
  });
  const [allocationData, setAllocationData] = useState({
    advanceAmount: 2100
  });

  // Same logic as server/config/pricing.js:getMinimumAdvance - must stay in
  // sync with the backend or Staff sees/enforces a different minimum advance
  // than the one the server will actually require at allocation time.
  const getMinimumAdvance = (s) => {
    switch (s.pricing_model) {
      case 'flat_daily': return Number(s.daily_rate) || 0;
      case 'free':       return 0;
      default:           return Number(s.first_day_charge) || 0; // tiered_flat_hourly
    }
  };
  const minimumAdvance = getMinimumAdvance(settings);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [cabinsRes, bodiesRes, allocationsRes, settingsRes] = await Promise.all([
        axios.get(`${API_BASE}/cabins`),
        axios.get(`${API_BASE}/bodies?status=Registered`),
        axios.get(`${API_BASE}/cabin-allocations`),
        axios.get(`${API_BASE}/billing-settings`).catch(() => ({ data: null }))
      ]);

      setCabins(cabinsRes.data);
      setBodies(bodiesRes.data);
      setAllocations(allocationsRes.data);
      if (settingsRes.data) {
        setSettings({
          pricing_model: settingsRes.data.pricing_model || 'tiered_flat_hourly',
          first_day_charge: Number(settingsRes.data.first_day_charge) || 0,
          hourly_charge_after_24hrs: Number(settingsRes.data.hourly_charge_after_24hrs) || 0,
          daily_rate: Number(settingsRes.data.daily_rate) || 0,
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const getCabinStatusColor = (status) => {
    switch (status) {
      case 'Available':
        return 'bg-green-500 hover:bg-green-600';
      case 'Occupied':
        return 'bg-red-500 hover:bg-red-600';
      case 'Under Maintenance':
        return 'bg-gray-400 hover:bg-gray-500';
      case 'NEEDS_CLEANING':
        return 'bg-yellow-500 hover:bg-yellow-600';
      default:
        return 'bg-gray-300';
    }
  };

  const getCabinBorderColor = (status) => {
    switch (status) {
      case 'Available':
        return 'border-green-400';
      case 'Occupied':
        return 'border-red-400';
      case 'Under Maintenance':
        return 'border-gray-400';
      case 'NEEDS_CLEANING':
        return 'border-yellow-400';
      default:
        return 'border-gray-300';
    }
  };

  const openAllocationModal = (cabin) => {
    if (cabin.status !== 'Available') {
      alert('This cabin is not available for allocation');
      return;
    }
    setSelectedCabin(cabin);
    setSelectedBody(''); // Reset selected body
    setSearchQuery(''); // Reset search query when opening modal
    setAllocationData({
      advanceAmount: minimumAdvance
    });
    setShowModal(true);
  };

  const handleAllocationSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBody) {
      alert('Please select a body');
      return;
    }

    if (allocationData.advanceAmount < minimumAdvance) {
      alert(`Advance collection is mandatory and must be at least ₹${minimumAdvance}`);
      return;
    }

    setLoading(true);
    try {
      console.log('Submitting allocation:', { bodyId: selectedBody, cabinId: selectedCabin.id, ...allocationData });
      const response = await axios.post(`${API_BASE}/cabin-allocations`, {
        bodyId: selectedBody,
        cabinId: selectedCabin.id,
        ...allocationData
      });
      console.log('Allocation response:', response.data);

      alert('Cabin allocated successfully');
      setShowModal(false);
      setSelectedBody('');
      fetchData();
    } catch (error) {
      console.error('Error allocating cabin:', error);
      console.error('Error response:', error.response?.data);
      alert(`Error: ${error.response?.data?.error || error.response?.data?.message || error.message || 'Error allocating cabin'}`);
    } finally {
      setLoading(false);
    }
  };

  const getAllocationByCabinId = (cabinId) => {
    return allocations.find(a => a.cabinId === cabinId && a.status === 'Allocated');
  };

  // Only show bodies that are eligible for cabin allocation:
  // - Non-MLC: always eligible
  // - MLC: only if freezerRequired is true (not 0 / null for non-MLC)
  const filteredBodies = bodies.filter(body => {
    const matchesSearch = !searchQuery ||
      body.bodyNumber?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      body.patientName?.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;
    // Exclude MLC bodies that don't require freezer
    if (body.bodyType === 'MLC' && body.freezerRequired === 0) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-800">Cabin Allocation</h1>
        <p className="text-gray-500">Manage cabin allocation and view availability</p>
      </div>

      {/* Legend */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-green-500 rounded"></div>
            <span className="text-sm text-gray-600">Available</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-red-500 rounded"></div>
            <span className="text-sm text-gray-600">Occupied</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-yellow-500 rounded"></div>
            <span className="text-sm text-gray-600">Needs Cleaning</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gray-400 rounded"></div>
            <span className="text-sm text-gray-600">Under Maintenance</span>
          </div>
        </div>
      </div>

      {/* Cabin Grid */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Cabin Availability</h2>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {cabins.filter(c => c.status !== 'Deactivated').map((cabin) => {
              const allocation = getAllocationByCabinId(cabin.id);
              return (
                <div
                  key={cabin.id}
                  onClick={() => openAllocationModal(cabin)}
                  className={`relative p-6 rounded-xl border-2 cursor-pointer transition-all duration-200 ${getCabinBorderColor(cabin.status)} ${getCabinStatusColor(cabin.status)} ${cabin.status === 'Available' ? 'hover:shadow-lg' : ''}`}
                >
                  <div className="text-center">
                    <div className="flex justify-center mb-3">
                      <Bed className="text-white" size={32} />
                    </div>
                    <h3 className="text-white font-bold text-lg">{cabin.cabinNumber}</h3>
                    <p className="text-white text-opacity-80 text-xs mt-1">
                      Flr {cabin.floor} • {cabin.cabin_type === 'FREEZER' ? 'Freezer' : 'Normal'}
                    </p>
                    {cabin.status === 'Occupied' && allocation && (
                      <div className="mt-3 pt-3 border-t border-white border-opacity-30">
                        <p className="text-white text-xs font-medium truncate">
                          {allocation.patientName || 'Unknown'}
                        </p>
                        <p className="text-white text-opacity-70 text-xs">
                          {allocation.bodyNumber}
                        </p>
                      </div>
                    )}
                  </div>
                  {cabin.status === 'Occupied' && (
                    <div className="absolute top-2 right-2">
                      <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active Allocations */}
      <div className="card">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Active Allocations</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="table-header">
                <th className="px-4 py-3 text-left">Body Number</th>
                <th className="px-4 py-3 text-left">Patient Name</th>
                <th className="px-4 py-3 text-left">Cabin</th>
                <th className="px-4 py-3 text-left">Admission Date/Time</th>
                <th className="px-4 py-3 text-left">Est. Release</th>
                <th className="px-4 py-3 text-left">Duration</th>
              </tr>
            </thead>
            <tbody>
              {allocations.filter(a => a.status === 'Allocated').length > 0 ? (
                allocations.filter(a => a.status === 'Allocated').map((allocation) => {
                  const admissionTime = new Date(allocation.admissionDateTime);
                  const estimatedReleaseTime = allocation.estimatedReleaseDateTime ? new Date(allocation.estimatedReleaseDateTime) : null;
                  const diffMs = estimatedReleaseTime ? estimatedReleaseTime - admissionTime : 0;
                  const totalHours = Math.floor(diffMs / (1000 * 60 * 60));
                  const days = Math.floor(totalHours / 24);
                  const hours = totalHours % 24;

                  return (
                    <tr key={allocation.id} className="table-row">
                      <td className="px-4 py-4 text-sm font-medium text-blue-600">{allocation.bodyNumber}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">{allocation.patientName || 'N/A'}</td>
                      <td className="px-4 py-4 text-sm">
                        <span className="status-badge status-occupied">{allocation.cabinNumber}</span>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-500">
                        {admissionTime.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-4 py-4 text-sm text-orange-600 font-medium">
                        {estimatedReleaseTime ? estimatedReleaseTime.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {days > 0 ? `${days} day${days > 1 ? 's' : ''}` : ''} {hours > 0 ? `${hours} hr${hours > 1 ? 's' : ''}` : ''}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan="6" className="px-4 py-8 text-center text-gray-500">
                    No active allocations
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Allocation Modal */}
      {showModal && selectedCabin && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
              <h2 className="text-xl font-semibold text-gray-800">Allocate Cabin</h2>
              <button
                onClick={() => setShowModal(false)}
                className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAllocationSubmit} className="p-6 space-y-4">
              {/* Cabin Info */}
              <div className="bg-blue-50 p-4 rounded-lg">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-blue-500 rounded-lg flex items-center justify-center">
                    <Bed className="text-white" size={24} />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Allocating Cabin</p>
                    <p className="text-xl font-bold text-blue-600">{selectedCabin.cabinNumber}</p>
                  </div>
                </div>
              </div>

              {/* Search Body */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Body *</label>
                <div className="relative mb-2">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search registered bodies..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input-field pl-9"
                  />
                </div>
                <select
                  value={selectedBody}
                  onChange={(e) => setSelectedBody(e.target.value)}
                  className="input-field"
                  required
                >
                  <option value="">Select a registered body</option>
                  {filteredBodies.map((body) => (
                    <option key={body.id} value={body.id}>
                      {body.bodyNumber} - {body.patientName || 'N/A'}
                    </option>
                  ))}
                </select>
                {filteredBodies.length === 0 && (
                  <p className="text-sm text-gray-500 mt-1">No registered bodies found</p>
                )}
              </div>

              {/* Advance Collection - Admin-set policy value, Staff can view
                  but not change it during allocation. */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Advance Collection {!canEditAdvance && <span className="text-xs text-gray-400 font-normal">(set by Admin)</span>}
                </label>
                <div className="relative">

                  <input
                    type="number"
                    value={allocationData.advanceAmount}
                    onChange={(e) => canEditAdvance && setAllocationData({ ...allocationData, advanceAmount: parseFloat(e.target.value) || 0 })}
                    readOnly={!canEditAdvance}
                    className={`input-field pl-7 ${!canEditAdvance ? 'bg-gray-100 text-gray-500 cursor-not-allowed' : ''}`}
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Stay Billing Policy Info */}
              <div className="bg-yellow-50 border border-yellow-200 p-4 rounded-lg space-y-2 text-xs text-yellow-800">
                <h4 className="font-semibold flex items-center gap-1.5 text-sm text-yellow-900">
                  <Clock size={14} /> Stay Billing Policy
                </h4>
                {settings.pricing_model === 'tiered_flat_hourly' && (
                  <>
                    <p>
                      * First 24 hours is charged as a flat <strong>₹{settings.first_day_charge}</strong> (covered by the mandatory advance).
                    </p>
                    <p>
                      * Every subsequent hour after 24 hours is charged at the rate of <strong>₹{settings.hourly_charge_after_24hrs}/hour</strong> (rounded up).
                    </p>
                  </>
                )}
                {settings.pricing_model === 'flat_daily' && (
                  <p>
                    * Charged at a flat <strong>₹{settings.daily_rate}/day</strong> (any part of a day counts as a full day, covered by the mandatory advance).
                  </p>
                )}
                {settings.pricing_model === 'free' && (
                  <p>* This hospital is on a free (no-charge) stay plan. No stay charges apply.</p>
                )}
                <p>
                  * This policy applies uniformly to all cabin types.
                </p>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !selectedBody}
                  className="btn-primary flex items-center gap-2"
                >
                  <CheckCircle size={18} />
                  {loading ? 'Allocating...' : 'Allocate Cabin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CabinAllocation;
