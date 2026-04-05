// Configuration
var EDGE_FN_BASE = 'https://jjckotsrhuxxftwmdlwc.supabase.co/functions/v1/reschedule-session';
var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqY2tvdHNyaHV4eGZ0d21kbHdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc4MTU4ODUsImV4cCI6MjA4MzM5MTg4NX0.AAQSDK4gu7lDUrFFk540HHELQ85S0vyATNQT6up-pXE';
var LOGO_BASE = 'https://jjckotsrhuxxftwmdlwc.supabase.co/storage/v1/object/public/location-logos/logos/';

var LOCATIONS = {
  'stretch-zone-westborough': { name: 'Stretch Zone Westborough', logo: LOGO_BASE + 'stretch-zone-westborough-1771338230095.png' },
  'stretch-zone-west-boylston': { name: 'Stretch Zone West Boylston', logo: LOGO_BASE + 'stretch-zone-west-boylston-1771338222411.png' },
  'stretch-zone-baton-rouge': { name: 'Stretch Zone Baton Rouge', logo: LOGO_BASE + 'stretch-zone-west-boylston-1771338222411.png' },
  'stretch-zone-dfw': { name: 'Stretch Zone Southlake', logo: LOGO_BASE + 'stretch-zone-west-boylston-1771338222411.png' },
  'stretchlab-carlsbad': { name: 'StretchLab Carlsbad', logo: LOGO_BASE + 'stretchlab-carlsbad-1771338129474.webp' }
};

// State
var params = {};
var selectedDate = null;
var selectedSlot = null;
var availableSlots = [];
var activeDurationFilter = null;

// Locations with multiple session durations
var MULTI_DURATION_LOCATIONS = {
  'stretchlab-carlsbad': [
    { duration: 25, label: '25 Min Stretch' },
    { duration: 50, label: '50 Min Stretch' }
  ]
};

// Init
(function init() {
  var sp = new URLSearchParams(window.location.search);
  params = {
    location: sp.get('location') || sp.get('loc') || '',
    name: sp.get('name') || '',
    phone: sp.get('phone') || '',
    date: sp.get('date') || '',
    time: sp.get('time') || '',
    instructor: sp.get('instructor') || '',
    bookingId: sp.get('booking_id') || sp.get('bookingId') || '',
    memberId: sp.get('member_id') || sp.get('memberId') || '',
    bookingRequestId: sp.get('request_id') || sp.get('requestId') || '',
    sessionSizeId: sp.get('session_size_id') || sp.get('sessionSizeId') || ''
  };

  var loc = LOCATIONS[params.location];
  if (loc) {
    document.getElementById('location-logo').src = loc.logo;
    document.getElementById('location-logo').alt = loc.name;
  } else {
    document.getElementById('location-logo').style.display = 'none';
  }

  var firstName = params.name ? params.name.split(' ')[0] : '';
  var greeting = document.getElementById('greeting');
  greeting.textContent = firstName
    ? 'Hi ' + firstName + "! Let's find a better time for your session."
    : "Let's find a better time for your session.";

  document.getElementById('current-date').textContent = params.date || 'Not specified';
  document.getElementById('current-time').textContent = params.time || 'Not specified';
  if (params.instructor) {
    document.getElementById('current-instructor').textContent = params.instructor;
  } else {
    document.getElementById('current-instructor-row').style.display = 'none';
  }

  loadAvailableDates();
})();

// API
function apiFetch(path, options) {
  var url = EDGE_FN_BASE + path;
  var headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY
  };
  if (options.headers) {
    for (var k in options.headers) headers[k] = options.headers[k];
  }
  return fetch(url, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body || undefined
  }).then(function(resp) {
    return resp.json().then(function(data) {
      if (!resp.ok) throw new Error(data.error || data.message || 'Request failed');
      return data;
    });
  });
}

function loadAvailableDates() {
  var loading = document.getElementById('date-loading');
  var grid = document.getElementById('date-grid');
  var error = document.getElementById('date-error');

  loading.style.display = 'flex';
  grid.innerHTML = '';
  error.style.display = 'none';

  var availUrl = '?action=availability&location=' + encodeURIComponent(params.location);
  if (params.sessionSizeId) availUrl += '&session_size_id=' + encodeURIComponent(params.sessionSizeId);
  apiFetch(availUrl, { method: 'GET' })
    .then(function(data) {
      loading.style.display = 'none';
      if (!data.dates || data.dates.length === 0) {
        error.textContent = 'No available dates found. Please call the studio to reschedule.';
        error.style.display = 'block';
        return;
      }
      var dates = data.dates.slice(0, 7);
      dates.forEach(function(dateStr) {
        var d = new Date(dateStr + 'T12:00:00');
        var btn = document.createElement('button');
        btn.className = 'date-btn';
        btn.setAttribute('data-date', dateStr);
        btn.innerHTML =
          '<span class="date-day">' + d.toLocaleDateString('en-US', { weekday: 'short' }) + '</span>' +
          '<span class="date-num">' + d.getDate() + '</span>' +
          '<span class="date-month">' + d.toLocaleDateString('en-US', { month: 'short' }) + '</span>';
        btn.onclick = function() { selectDate(dateStr, btn); };
        grid.appendChild(btn);
      });
    })
    .catch(function(e) {
      loading.style.display = 'none';
      error.textContent = 'Could not load available dates. Please try again or call the studio.';
      error.style.display = 'block';
      console.error('loadAvailableDates error:', e);
    });
}

function loadTimeSlotsForDate(dateStr) {
  var stepTime = document.getElementById('step-time');
  var loading = document.getElementById('time-loading');
  var grid = document.getElementById('time-grid');
  var error = document.getElementById('time-error');
  var hint = document.getElementById('time-hint');

  stepTime.style.display = 'block';
  loading.style.display = 'flex';
  grid.innerHTML = '';
  error.style.display = 'none';
  selectedSlot = null;

  var d = new Date(dateStr + 'T12:00:00');
  hint.textContent = 'Available times for ' + d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('step-confirm').style.display = 'none';

  var slotsUrl = '?action=slots&location=' + encodeURIComponent(params.location) + '&date=' + dateStr;
  if (params.sessionSizeId) slotsUrl += '&session_size_id=' + encodeURIComponent(params.sessionSizeId);
  apiFetch(slotsUrl, { method: 'GET' })
    .then(function(data) {
      loading.style.display = 'none';
      availableSlots = data.slots || [];
      if (availableSlots.length === 0) {
        error.textContent = 'No available times for this date. Try another date.';
        error.style.display = 'block';
        return;
      }
      var multiDur = MULTI_DURATION_LOCATIONS[params.location];
      if (multiDur && availableSlots.some(function(s) { return s.duration; })) {
        var toggleWrap = document.createElement('div');
        toggleWrap.style.cssText = 'display:flex;gap:8px;justify-content:center;margin-bottom:16px;';
        if (!activeDurationFilter) activeDurationFilter = multiDur[0].duration;
        multiDur.forEach(function(d) {
          var tbtn = document.createElement('button');
          tbtn.className = 'time-btn' + (activeDurationFilter === d.duration ? ' selected' : '');
          tbtn.style.cssText = 'flex:1;max-width:180px;padding:12px 16px;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;';
          tbtn.textContent = d.label;
          tbtn.onclick = function() {
            activeDurationFilter = d.duration;
            selectedSlot = null;
            document.getElementById('step-confirm').style.display = 'none';
            loading.style.display = 'none';
            grid.innerHTML = '';
            renderTimeSlots(grid);
          };
          toggleWrap.appendChild(tbtn);
        });
        grid.appendChild(toggleWrap);
        renderTimeSlots(grid);
      } else {
        availableSlots.forEach(function(slot, i) {
          var btn = document.createElement('button');
          btn.className = 'time-btn';
          btn.setAttribute('data-index', i);
          btn.innerHTML =
            '<span class="time-value">' + slot.timeLocal + '</span>' +
            '<span class="time-instructor">' + (slot.instructor || '') + '</span>';
          btn.onclick = function() { selectTime(i, btn); };
          grid.appendChild(btn);
        });
      }
      stepTime.scrollIntoView({ behavior: 'smooth', block: 'start' });
    })
    .catch(function(e) {
      loading.style.display = 'none';
      error.textContent = 'Could not load times. Please try again.';
      error.style.display = 'block';
      console.error('loadTimeSlotsForDate error:', e);
    });
}

function renderTimeSlots(grid) {
  var existing = grid.querySelectorAll('.time-btn:not([style])');
  existing.forEach(function(el) { if (!el.style.cssText.includes('max-width')) el.remove(); });
  var filtered = availableSlots.filter(function(s, i) {
    return !activeDurationFilter || s.duration === activeDurationFilter;
  });
  // Re-render toggle active state
  var toggleBtns = grid.querySelectorAll('[style*="max-width"]');
  toggleBtns.forEach(function(b) {
    if (b.textContent.indexOf(activeDurationFilter + ' Min') >= 0) {
      b.classList.add('selected');
    } else {
      b.classList.remove('selected');
    }
  });
  filtered.forEach(function(slot) {
    var origIdx = availableSlots.indexOf(slot);
    var btn = document.createElement('button');
    btn.className = 'time-btn';
    btn.setAttribute('data-index', origIdx);
    btn.innerHTML =
      '<span class="time-value">' + slot.timeLocal + '</span>' +
      '<span class="time-instructor">' + (slot.instructor || '') + '</span>';
    btn.onclick = function() { selectTime(origIdx, btn); };
    grid.appendChild(btn);
  });
  if (filtered.length === 0) {
    var noMsg = document.createElement('div');
    noMsg.style.cssText = 'text-align:center;padding:20px;color:#666;';
    noMsg.textContent = 'No ' + activeDurationFilter + '-minute slots available on this day.';
    grid.appendChild(noMsg);
  }
}

function selectDate(dateStr, btn) {
  var prev = document.querySelector('.date-btn.selected');
  if (prev) prev.classList.remove('selected');
  btn.classList.add('selected');
  selectedDate = dateStr;
  loadTimeSlotsForDate(dateStr);
}

function selectTime(index, btn) {
  var prev = document.querySelector('.time-btn.selected');
  if (prev) prev.classList.remove('selected');
  btn.classList.add('selected');
  selectedSlot = availableSlots[index];
  showConfirmation();
}

function showConfirmation() {
  var section = document.getElementById('step-confirm');
  section.style.display = 'block';

  document.getElementById('confirm-old-date').textContent = params.date || 'N/A';
  document.getElementById('confirm-old-time').textContent = params.time || 'N/A';

  var d = new Date(selectedDate + 'T12:00:00');
  document.getElementById('confirm-new-date').textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'long', day: 'numeric' });
  document.getElementById('confirm-new-time').textContent = selectedSlot.timeLocal;

  var instrEl = document.getElementById('confirm-instructor');
  if (selectedSlot.instructor) {
    instrEl.textContent = 'with ' + selectedSlot.instructor;
    instrEl.style.display = 'block';
  } else {
    instrEl.style.display = 'none';
  }

  document.getElementById('btn-confirm').disabled = false;
  document.getElementById('btn-confirm-text').style.display = 'inline';
  document.getElementById('btn-confirm-loading').style.display = 'none';

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function confirmReschedule() {
  var btn = document.getElementById('btn-confirm');
  var btnText = document.getElementById('btn-confirm-text');
  var btnLoading = document.getElementById('btn-confirm-loading');
  var errorBanner = document.getElementById('error-banner');
  var errorMsg = document.getElementById('error-message');

  btn.disabled = true;
  btnText.style.display = 'none';
  btnLoading.style.display = 'inline';
  errorBanner.style.display = 'none';

  var body = {
    location: params.location,
    name: params.name,
    phone: params.phone,
    oldBookingId: params.bookingId,
    oldDate: params.date,
    oldTime: params.time,
    oldInstructor: params.instructor,
    bookingRequestId: params.bookingRequestId,
    memberId: params.memberId,
    newDate: selectedDate,
    newTimeUtc: selectedSlot.startTimeUtc,
    newTimeLocal: selectedSlot.timeLocal,
    instructorId: selectedSlot.instructorId,
    instructorName: selectedSlot.instructor,
    sessionSizeId: params.sessionSizeId ? parseInt(params.sessionSizeId, 10) : selectedSlot.sessionSizeId,
    duration: selectedSlot.duration || activeDurationFilter || 0
  };

  apiFetch('', { method: 'POST', body: JSON.stringify(body) })
    .then(function(data) {
      if (data.success) {
        showSuccess();
      } else {
        throw new Error(data.message || 'Reschedule failed. Please try again.');
      }
    })
    .catch(function(e) {
      btn.disabled = false;
      btnText.style.display = 'inline';
      btnLoading.style.display = 'none';
      errorMsg.textContent = e.message || 'Something went wrong. Please try again or call the studio.';
      errorBanner.style.display = 'block';
      console.error('confirmReschedule error:', e);
    });
}

function showSuccess() {
  document.getElementById('current-booking').style.display = 'none';
  document.getElementById('step-date').style.display = 'none';
  document.getElementById('step-time').style.display = 'none';
  document.getElementById('step-confirm').style.display = 'none';
  document.getElementById('error-banner').style.display = 'none';

  var d = new Date(selectedDate + 'T12:00:00');
  document.getElementById('success-date').textContent = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  document.getElementById('success-time').textContent = selectedSlot.timeLocal;

  if (selectedSlot.instructor) {
    document.getElementById('success-instructor').textContent = selectedSlot.instructor;
  } else {
    document.getElementById('success-instructor-row').style.display = 'none';
  }

  document.getElementById('success-screen').style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetSelection() {
  selectedDate = null;
  selectedSlot = null;
  availableSlots = [];
  document.getElementById('step-time').style.display = 'none';
  document.getElementById('step-confirm').style.display = 'none';
  document.getElementById('error-banner').style.display = 'none';
  var prev = document.querySelector('.date-btn.selected');
  if (prev) prev.classList.remove('selected');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
