const SEED = window.SEED_DATA;
const airports = SEED.airports.filter(a => a.is_active !== false);
const airlines = SEED.airlines || [];
const allFlights = (SEED.flights || [...(SEED.outbound_flights || []), ...(SEED.inbound_flights || [])]).filter(f => f.is_active !== false);
const airportById = Object.fromEntries(airports.map(a => [a.airport_id, a]));
const airlineById = Object.fromEntries(airlines.map(a => [a.airline_id, a]));
const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
const round1000 = n => Math.round(n / 1000) * 1000;
const TYPE_ORDER = ['low_cost', 'standard', 'major'];
const TYPE_LABEL = { low_cost: '저가 항공사', standard: '기본 항공사', major: '대형 항공사' };
const TYPE_CHIP = { low_cost: 'green', standard: 'blue', major: 'purple' };
const REGIONS = ['대한민국','일본','동북아시아','동남아시아','미주','유럽','괌/오세아니아','러시아/몽골/중앙아시아','중동/아프리카'];
const SPECIAL_LABELS = {
  ICN: '서울/인천', GMP: '서울/김포', NRT: '도쿄/나리타', HND: '도쿄/하네다',
  KIX: '오사카/간사이', UKB: '오사카/고베', CTS: '삿포로', FUK: '후쿠오카', NGO: '나고야', OKA: '오키나와',
  PVG: '상하이/푸둥', SHA: '상하이/훙차오', TPE: '타이베이/타오위안', RMQ: '타이중',
  GUM: '괌', HNL: '호놀룰루', DXB: '두바이'
};
const fareRules = [
  { id: 'basic', name: 'Basic', add: 0, perks: ['기내 수하물', '좌석 랜덤', '기내식 불가', 'Flex 구역 제한'], meal: false, mealPolicy: '기내식 선택 불가' },
  { id: 'standard', name: 'Standard', add: 38000, perks: ['위탁 15kg', '좌석 선택', '기내식 추가결제', 'Flex 구역 제한'], meal: true, mealPolicy: '선택 메뉴 추가결제' },
  { id: 'flex', name: 'Flex', add: 89000, perks: ['위탁 23kg', 'Flex 구역 전용', '기내식 무료 선택', '우선 탑승'], meal: true, mealPolicy: '선택 메뉴 무료 포함' }
];
const mealOptions = (SEED.meal_table || []).filter(m => m.is_active !== false).map(m => ({
  id: m.meal_id,
  title: m.name,
  category: m.category,
  desc: m.description,
  price: m.price_krw || 0,
  image: m.image || '',
  childOnly: !!m.child_only
}));
const state = {
  step: 0,
  tripType: 'roundtrip',
  origin: 'ICN',
  destination: 'NRT',
  departDate: '2026-07-01',
  returnDate: '2026-07-08',
  pax: { adult: 1, child: 0, infant: 0 },
  outboundId: null,
  inboundId: null,
  fareId: 'standard',
  mealId: 'none',
  passenger: { lastName: '', firstName: '', phone: '' },
  passengerProfiles: [],
  meals: { outbound: {}, inbound: {} },
  seats: { outbound: {}, inbound: {} },
  seatTargetBySector: { outbound: 'adult-1', inbound: 'adult-1' },
  mealTarget: { sector: 'outbound', passengerId: 'adult-1' },
  reviewTab: 'route',
  seat: '',
  bookingCode: '',
  modal: null,
  airportField: 'origin',
  activeRegion: '대한민국',
  airportQuery: '',
  helpKey: null,
  passengerValidationAttempted: false
};
const app = document.getElementById('app');
const progress = document.getElementById('progress');
const modalBackdrop = document.getElementById('modalBackdrop');
const modalSheet = document.getElementById('modalSheet');

function h(value) {
  return String(value ?? '').replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}
function regionOfAirport(a) {
  if (!a) return '동북아시아';
  const c = a.country_ko;
  if (c === '대한민국') return '대한민국';
  if (c === '일본') return '일본';
  if (['중국','홍콩','마카오','대만'].includes(c)) return '동북아시아';
  if (['캄보디아','인도','인도네시아','말레이시아','미얀마','네팔','필리핀','싱가포르','태국','베트남'].includes(c)) return '동남아시아';
  if (['미국','캐나다'].includes(c)) return '미주';
  if (['오스트리아','체코','프랑스','독일','헝가리','이탈리아','네덜란드','포르투갈','튀르키예','스페인','스위스','영국'].includes(c)) return '유럽';
  if (['괌','호주','뉴질랜드'].includes(c)) return '괌/오세아니아';
  if (['몽골','러시아','카자흐스탄','우즈베키스탄'].includes(c)) return '러시아/몽골/중앙아시아';
  if (['아랍에미리트','카타르','사우디아라비아','이집트','남아프리카공화국'].includes(c)) return '중동/아프리카';
  return '동북아시아';
}
function airportLabel(code) {
  const a = airportById[code];
  if (!a) return code;
  return SPECIAL_LABELS[code] || a.city_ko;
}
function airportOptionLabel(a) { return `${airportLabel(a.airport_id)}(${a.airport_id})`; }
function airportSub(a) { return `${a.airport_name_ko} · ${a.country_ko}`; }
function airportSortValue(a) { return airportLabel(a.airport_id); }
function sortedAirports(region, query='') {
  let list = airports.filter(a => regionOfAirport(a) === region);
  const q = query.trim().toLowerCase();
  if (q) {
    list = airports.filter(a => `${airportLabel(a.airport_id)} ${a.airport_id} ${a.city_ko} ${a.airport_name_ko} ${a.country_ko}`.toLowerCase().includes(q));
  }
  list.sort((a,b) => airportSortValue(a).localeCompare(airportSortValue(b), 'ko-KR'));
  if (!q && region === '대한민국') {
    const frontCodes = ['ICN','GMP'];
    const front = frontCodes.map(c => airportById[c]).filter(Boolean);
    const rest = list.filter(a => !frontCodes.includes(a.airport_id));
    return [...front, ...rest];
  }
  return list;
}
function fmtTime(iso) {
  if (!iso) return '--:--';
  const m = String(iso).match(/T(\d{2}:\d{2})/);
  return m ? m[1] : iso.slice(11,16);
}
function fmtDate(iso) { return String(iso || '').slice(0,10); }
function durationText(min) {
  const h2 = Math.floor((min || 0) / 60), m = (min || 0) % 60;
  return h2 ? `${h2}시간 ${m ? m + '분' : ''}` : `${m}분`;
}
function addMinutesToTime(hhmm, mins) {
  const [hh,mm] = hhmm.split(':').map(Number);
  const total = (hh*60 + mm + mins) % (24*60);
  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}
function displayFare(f) { return round1000((f.base_fare_krw || 0) * 0.7); }
function airlineForType(type, seedIndex=0) {
  const arr = airlines.filter(a => a.airline_type === type);
  return arr[seedIndex % Math.max(arr.length, 1)] || airlines[seedIndex % airlines.length] || { airline_id:'DMO', airline_name:'Demo Air', logo_text:'DM', brand_color:'#2563eb', airline_type:type, airline_type_ko:TYPE_LABEL[type] };
}
function estimateFare(origin, dest, type) {
  const r = regionOfAirport(airportById[dest]);
  const base = { '대한민국': 95000, '일본': 310000, '동북아시아': 520000, '동남아시아': 900000, '괌/오세아니아': 1120000, '미주': 2200000, '유럽': 2100000, '러시아/몽골/중앙아시아': 790000, '중동/아프리카': 1250000 }[r] || 520000;
  const mul = { low_cost: .84, standard: 1, major: 1.14 }[type] || 1;
  return round1000(base * mul);
}
function estimateDuration(origin, dest) {
  const r = regionOfAirport(airportById[dest]);
  return { '대한민국': 70, '일본': 135, '동북아시아': 190, '동남아시아': 350, '괌/오세아니아': 520, '미주': 690, '유럽': 760, '러시아/몽골/중앙아시아': 230, '중동/아프리카': 600 }[r] || 210;
}
function synthFlight(type, origin, dest, date, base, idx) {
  const airline = airlineForType(type, idx + (type === 'standard' ? 3 : type === 'major' ? 6 : 0));
  const departTimes = { low_cost: '08:20', standard: '13:35', major: '19:05' };
  const duration = base?.duration_minutes || estimateDuration(origin, dest);
  const depart = departTimes[type] || '12:00';
  const arrive = addMinutesToTime(depart, duration);
  const baseFare = base?.base_fare_krw ? round1000(base.base_fare_krw * ({low_cost:.92, standard:1.02, major:1.15}[type] || 1)) : estimateFare(origin, dest, type);
  return {
    flight_id: `DEMO-${type}-${origin}-${dest}-${date}`,
    synthetic: true,
    airline_id: airline.airline_id,
    airline_name: airline.airline_name,
    airline_type: type,
    airline_type_ko: TYPE_LABEL[type],
    flight_number: `${airline.airline_id}${String(320 + idx * 7 + TYPE_ORDER.indexOf(type)).padStart(3,'0')}`,
    departure_airport_id: origin,
    departure_city_ko: airportById[origin]?.city_ko || origin,
    departure_airport_name_ko: airportById[origin]?.airport_name_ko || origin,
    departure_country_ko: airportById[origin]?.country_ko || '',
    arrival_airport_id: dest,
    arrival_city_ko: airportById[dest]?.city_ko || dest,
    arrival_airport_name_ko: airportById[dest]?.airport_name_ko || dest,
    arrival_country_ko: airportById[dest]?.country_ko || '',
    route_region: regionOfAirport(airportById[dest]),
    departure_at: `${date}T${depart}:00+09:00`,
    arrival_at: `${date}T${arrive}:00+09:00`,
    duration_minutes: duration,
    aircraft: type === 'major' ? 'Cloudliner 990' : type === 'standard' ? 'AeroLite 330' : 'SkyMango 300',
    base_fare_krw: baseFare,
    available_seats: type === 'low_cost' ? 18 : type === 'standard' ? 34 : 52,
    status: 'scheduled',
    is_active: true
  };
}
function getOptions(origin, dest, date) {
  const exact = allFlights.filter(f => f.departure_airport_id === origin && f.arrival_airport_id === dest);
  const options = TYPE_ORDER.map((type, idx) => {
    const exactForType = exact.find(f => f.airline_type === type && !f._used);
    if (exactForType) { exactForType._used = true; return {...exactForType}; }
    const base = exact[0] || allFlights.find(f => f.arrival_airport_id === dest) || allFlights.find(f => f.route_region === regionOfAirport(airportById[dest]));
    return synthFlight(type, origin, dest, date, base, idx);
  });
  exact.forEach(f => delete f._used);
  return options;
}
function currentOutboundOptions() { return getOptions(state.origin, state.destination, state.departDate); }
function currentInboundOptions() { return getOptions(state.destination, state.origin, state.returnDate); }
function selectedOutbound() { return currentOutboundOptions().find(f => f.flight_id === state.outboundId) || null; }
function selectedInbound() { return currentInboundOptions().find(f => f.flight_id === state.inboundId) || null; }
function selectedFare() { return fareRules.find(f => f.id === state.fareId) || fareRules[1]; }
function sectors() { return state.tripType === 'roundtrip' ? ['outbound', 'inbound'] : ['outbound']; }
function sectorLabel(sector) { return sector === 'outbound' ? '가는 편' : '오는 편'; }
function flightForSector(sector) { return sector === 'outbound' ? selectedOutbound() : selectedInbound(); }
function dateForSector(sector) { return sector === 'outbound' ? state.departDate : state.returnDate; }
function sectorRouteLabel(sector) {
  const f = flightForSector(sector);
  if (!f) return sectorLabel(sector);
  return `${f.departure_airport_id} → ${f.arrival_airport_id}`;
}
function buildPassengerSlots() {
  const slots = [];
  for (let i=1; i<=state.pax.adult; i++) slots.push({ id:`adult-${i}`, type:'adult', typeKo:'성인', index:i, label:`성인 ${i}` });
  for (let i=1; i<=state.pax.child; i++) slots.push({ id:`child-${i}`, type:'child', typeKo:'소아', index:i, label:`소아 ${i}` });
  for (let i=1; i<=state.pax.infant; i++) slots.push({ id:`infant-${i}`, type:'infant', typeKo:'유아', index:i, label:`유아 ${i}` });
  return slots;
}
function syncPassengers() {
  const prev = Object.fromEntries((state.passengerProfiles || []).map(p => [p.id, p]));
  state.passengerProfiles = buildPassengerSlots().map(slot => {
    const old = prev[slot.id] || {};
    const legacy = slot.id === 'adult-1' ? state.passenger : {};
    return {
      ...slot,
      lastName: old.lastName ?? legacy.lastName ?? '',
      firstName: old.firstName ?? legacy.firstName ?? '',
      phone: old.phone ?? legacy.phone ?? ''
    };
  });
  const validIds = new Set(state.passengerProfiles.map(p => p.id));
  ['outbound','inbound'].forEach(sector => {
    state.meals[sector] ||= {};
    state.seats[sector] ||= {};
    Object.keys(state.meals[sector]).forEach(id => { if (!validIds.has(id)) delete state.meals[sector][id]; });
    Object.keys(state.seats[sector]).forEach(id => { if (!validIds.has(id)) delete state.seats[sector][id]; });
    state.passengerProfiles.forEach(p => {
      if (p.type !== 'infant' && state.meals[sector][p.id] == null) state.meals[sector][p.id] = 'none';
    });
  });
  sanitizeMeals();
  if (!seatPassengers().find(p => p.id === state.seatTargetBySector.outbound)) state.seatTargetBySector.outbound = seatPassengers()[0]?.id || '';
  if (!seatPassengers().find(p => p.id === state.seatTargetBySector.inbound)) state.seatTargetBySector.inbound = seatPassengers()[0]?.id || '';
  if (!seatPassengers().find(p => p.id === state.mealTarget.passengerId)) state.mealTarget.passengerId = seatPassengers()[0]?.id || '';
}
function passengerList() { syncPassengers(); return state.passengerProfiles; }
function seatPassengers() { return state.passengerProfiles.filter(p => p.type !== 'infant'); }
function passengerById(id) { return passengerList().find(p => p.id === id); }
function passengerSummary() {
  const p = state.pax;
  const parts = [`성인 ${p.adult}`];
  if (p.child) parts.push(`소아 ${p.child}`);
  if (p.infant) parts.push(`유아 ${p.infant}`);
  return parts.join(', ');
}
function passengerUnits() { return state.pax.adult + state.pax.child * 0.75 + state.pax.infant * 0.10; }
function seatPassengerCount() { return state.pax.adult + state.pax.child; }
function sectorCount() { return sectors().length; }
function fareBaseTotal() {
  const out = selectedOutbound();
  const inbound = state.tripType === 'roundtrip' ? selectedInbound() : null;
  return ((out ? displayFare(out) : 0) + (inbound ? displayFare(inbound) : 0)) * passengerUnits();
}
function fareAddTotal() { return selectedFare().add * Math.max(1, seatPassengerCount()); }
function mealAvailable() { return selectedFare().meal; }
function mealFor(sector, passengerId) {
  const id = state.meals[sector]?.[passengerId] || 'none';
  return mealOptions.find(m => m.id === id) || mealOptions[0];
}
function mealIsSelectable(meal, passenger) {
  if (!meal) return false;
  if (meal.id === 'none') return true;
  if (!passenger || passenger.type === 'infant') return false;
  if (meal.childOnly) return passenger.type === 'child';
  return true;
}
function sanitizeMeals() {
  if (!mealAvailable()) {
    ['outbound','inbound'].forEach(sector => { state.meals[sector] = {}; });
    return;
  }
  ['outbound','inbound'].forEach(sector => {
    state.meals[sector] ||= {};
    state.passengerProfiles.filter(p => p.type !== 'infant').forEach(p => {
      const meal = mealOptions.find(m => m.id === state.meals[sector][p.id]) || mealOptions[0];
      if (!mealIsSelectable(meal, p)) state.meals[sector][p.id] = 'none';
    });
  });
}
function selectedMealEntries() {
  if (!mealAvailable()) return [];
  const entries = [];
  sectors().forEach(sector => {
    seatPassengers().forEach(p => {
      const meal = mealFor(sector, p.id);
      if (meal && meal.id !== 'none') entries.push({ sector, passenger: p, meal });
    });
  });
  return entries;
}
function mealQuantity() { return selectedMealEntries().length; }
function mealTotal() {
  if (!mealAvailable() || selectedFare().id === 'flex') return 0;
  return selectedMealEntries().reduce((sum, e) => sum + (e.meal.price || 0), 0);
}
function mealAggregates() {
  const map = new Map();
  selectedMealEntries().forEach(({meal}) => {
    const cur = map.get(meal.id) || { meal, count: 0, total: 0 };
    cur.count += 1;
    cur.total += meal.price || 0;
    map.set(meal.id, cur);
  });
  return Array.from(map.values());
}
function mealPriceLabel(meal, passenger) {
  if (!meal || meal.id === 'none') return '₩0';
  if (!mealIsSelectable(meal, passenger)) return '선택 불가';
  if (selectedFare().id === 'flex') return 'Flex 무료';
  return won(meal.price || 0);
}
function mealSummaryLabel() {
  if (!mealAvailable()) return '선택 불가';
  const qty = mealQuantity();
  if (!qty) return '선택 안 함';
  if (selectedFare().id === 'flex') return `${qty}개 선택 · Flex 무료 포함`;
  return `${qty}개 선택 · ${won(mealTotal())}`;
}
function fuelTaxTotal() { return 12000 * sectorCount() * Math.max(1, state.pax.adult + state.pax.child + state.pax.infant); }
function totalPrice() { return fareBaseTotal() + fareAddTotal() + mealTotal() + fuelTaxTotal(); }
function go(step) { state.step = step; syncPassengers(); if (step === 3) ensureSeatDefaults(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function renderProgress() { progress.innerHTML = Array.from({length:7}).map((_,i)=>`<div class="dot ${i<=state.step?'active':''}"></div>`).join(''); }
function resetSearchSelection() {
  state.outboundId = null;
  state.inboundId = null;
  state.seat = '';
  state.seats = { outbound: {}, inbound: {} };
}
function swapRoute() { const o = state.origin; state.origin = state.destination; state.destination = o; resetSearchSelection(); render(); }
function modalSwapRoute() { const o = state.origin; state.origin = state.destination; state.destination = o; renderModal(); render(); }
function setTripType(type) { state.tripType = type; if (type === 'oneway') state.inboundId = null; syncPassengers(); render(); }
function updatePassenger(key, value) { state.passenger[key] = value; }
function formatPhoneNumber(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}
function isNameValid(value) {
  return /^[가-힣a-zA-Z]+$/.test(String(value || '').trim());
}
function phoneDigits(value) {
  return String(value || '').replace(/\D/g, '');
}
function isPhoneValid(value) {
  return /^\d{11}$/.test(phoneDigits(value));
}
function isPassengerInfoValid() {
  return passengerList().every(p =>
    isNameValid(p.lastName) &&
    isNameValid(p.firstName) &&
    isPhoneValid(p.phone)
  );
}
function passengerFieldError(p, key) {
  if (!state.passengerValidationAttempted) return '';
  const value = String(p?.[key] || '').trim();
  if (!value) return '필수 입력';
  if ((key === 'lastName' || key === 'firstName') && !isNameValid(value)) return '한글 또는 영어만 입력';
  if (key === 'phone' && !isPhoneValid(value)) return '전화번호 숫자 11자리 입력';
  return '';
}
function passengerFieldClass(p, key) {
  return passengerFieldError(p, key) ? ' invalid' : '';
}
function updatePassengerFieldUi(inputEl, p, key) {
  if (!inputEl) return;
  const field = inputEl.closest('.field');
  if (!field) return;
  const error = passengerFieldError(p, key);
  field.classList.toggle('invalid', !!error);
  const msg = field.querySelector('.field-error');
  if (msg) msg.textContent = error;
}
function updatePassengerProfile(id, key, value, inputEl) {
  syncPassengers();
  const p = state.passengerProfiles.find(item => item.id === id);
  if (!p) return;
  p[key] = key === 'phone' ? formatPhoneNumber(value) : String(value || '');
  if (inputEl && key === 'phone') inputEl.value = p[key];
  if (id === 'adult-1') state.passenger[key] = p[key];
  updatePassengerFieldUi(inputEl, p, key);
}
function handlePassengerInfoNext() {
  state.passengerValidationAttempted = true;
  if (!isPassengerInfoValid()) { render(); return; }
  go(3);
}
function makeBookingCode() { state.bookingCode = 'AM' + Math.random().toString(36).slice(2,8).toUpperCase(); }
function canProceedFare() { return !!selectedOutbound() && (state.tripType === 'oneway' || !!selectedInbound()); }
function sectorSeatComplete(sector) {
  return seatPassengers().every(p => !!state.seats[sector]?.[p.id]);
}
function canProceedSeats() {
  ensureSeatDefaults();
  return sectors().every(sector => sectorSeatComplete(sector));
}
function nextStepAfterSeats() {
  if (mealAvailable()) go(4);
  else go(5);
}
function safeFilePart(value) {
  return String(value || '')
    .trim()
    .replace(/[\\/:*?"<>|#%&{}$!`'@+= ]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'file';
}
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function boardingPassItems() {
  const items = [];
  sectors().forEach(sector => {
    const f = flightForSector(sector);
    passengerList().forEach(p => items.push({ index: items.length, sector, f, p }));
  });
  return items;
}
function boardingPassFileName(item) {
  const booking = safeFilePart(state.bookingCode || 'DEMO');
  const sector = item.sector === 'outbound' ? 'OUT' : 'IN';
  const route = item.f ? safeFilePart(`${item.f.departure_airport_id}-${item.f.arrival_airport_id}`) : 'ROUTE';
  const passenger = safeFilePart(item.p?.id || `PAX-${item.index + 1}`);
  return `AirMock_v9_${booking}_${String(item.index + 1).padStart(2, '0')}_${sector}_${route}_${passenger}.png`;
}
async function createBoardingPassCanvas(el) {
  if (!window.html2canvas) {
    throw new Error('PNG 저장 라이브러리를 불러오지 못했습니다. 인터넷 연결을 확인해 주세요.');
  }
  return await window.html2canvas(el, {
    scale: 2,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false
  });
}
function triggerPngDownload(canvas, fileName) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
async function downloadBoardingPassPng(index) {
  const el = document.getElementById(`boarding-pass-${index}`);
  if (!el) { alert('저장할 보딩패스를 찾지 못했습니다.'); return; }
  try {
    const canvas = await createBoardingPassCanvas(el);
    triggerPngDownload(canvas, el.dataset.fileName || `AirMock_BoardingPass_${index + 1}.png`);
  } catch (error) {
    alert(error.message || 'PNG 저장 중 오류가 발생했습니다.');
  }
}
async function downloadAllBoardingPassPng() {
  const cards = Array.from(document.querySelectorAll('.boarding-pass-capture'));
  if (!cards.length) { alert('저장할 보딩패스가 없습니다.'); return; }
  try {
    for (let i = 0; i < cards.length; i++) {
      const canvas = await createBoardingPassCanvas(cards[i]);
      triggerPngDownload(canvas, cards[i].dataset.fileName || `AirMock_BoardingPass_${i + 1}.png`);
      await delay(300);
    }
    alert(`${cards.length}개의 PNG 저장 요청을 완료했습니다. 브라우저가 여러 파일 다운로드 허용을 물으면 허용을 눌러 주세요.`);
  } catch (error) {
    alert(error.message || '전체 PNG 저장 중 오류가 발생했습니다.');
  }
}
function openModal(type) { state.modal = type; state.helpKey = null; modalBackdrop.classList.remove('hidden'); renderModal(); }
function closeModal() { state.modal = null; state.airportQuery = ''; state.helpKey = null; modalBackdrop.classList.add('hidden'); modalSheet.innerHTML = ''; }
function closeModalBackdrop(e) { if (e.target === modalBackdrop) closeModal(); }
function openAirport(field) {
  state.airportField = field;
  state.activeRegion = regionOfAirport(airportById[state[field]]);
  state.airportQuery = '';
  openModal('airport');
}
function selectAirport(code) {
  if (state.airportField === 'origin') state.origin = code;
  else state.destination = code;
  if (state.origin === state.destination) {
    if (state.airportField === 'origin') state.destination = state.origin === 'ICN' ? 'NRT' : 'ICN';
    else state.origin = state.destination === 'ICN' ? 'NRT' : 'ICN';
  }
  resetSearchSelection();
  closeModal();
  render();
}
function setRegion(region) { state.activeRegion = region; state.airportQuery = ''; renderModal(); }
function setAirportQuery(v) { state.airportQuery = v; renderModal(); }
function changePax(type, delta) {
  const p = state.pax;
  if (type === 'adult') p.adult = Math.max(1, Math.min(9, p.adult + delta));
  if (type === 'child') p.child = Math.max(0, Math.min(8, p.child + delta));
  if (type === 'infant') p.infant = Math.max(0, Math.min(p.adult, p.infant + delta));
  if (p.infant > p.adult) p.infant = p.adult;
  state.passengerValidationAttempted = false;
  syncPassengers();
  ensureSeatDefaults();
  renderModal(); render();
}
function showHelp(key) { state.helpKey = state.helpKey === key ? null : key; renderModal(); }
function openMealPicker(sector, passengerId) {
  state.mealTarget = { sector, passengerId };
  openModal('meal');
}
function setMeal(id) {
  const meal = mealOptions.find(m => m.id === id);
  const passenger = passengerById(state.mealTarget.passengerId);
  if (!mealIsSelectable(meal, passenger)) { alert('이 메뉴는 해당 탑승객에게 선택할 수 없어요.'); return; }
  state.meals[state.mealTarget.sector][state.mealTarget.passengerId] = id;
  closeModal(); render();
}
function copyOutboundMealsToInbound() {
  if (state.tripType !== 'roundtrip') return;
  seatPassengers().forEach(p => {
    const meal = mealFor('outbound', p.id);
    if (mealIsSelectable(meal, p)) state.meals.inbound[p.id] = meal.id;
  });
  render();
}
function applyFirstMealToSector(sector) {
  const first = seatPassengers()[0];
  if (!first) return;
  const meal = mealFor(sector, first.id);
  seatPassengers().forEach(p => {
    if (mealIsSelectable(meal, p)) state.meals[sector][p.id] = meal.id;
  });
  render();
}
function selectFlight(kind, id) {
  if (kind === 'outbound') { state.outboundId = id; state.seats.outbound = {}; state.seat = ''; }
  else { state.inboundId = id; state.seats.inbound = {}; }
  ensureSeatDefaults();
  render();
}
function setFare(id) {
  state.fareId = id;
  syncPassengers();
  ensureSeatDefaults(true);
  render();
}
function setReviewTab(tab) { state.reviewTab = tab; render(); }

function renderModal() {
  if (state.modal === 'airport') return renderAirportModal();
  if (state.modal === 'passenger') return renderPassengerModal();
  if (state.modal === 'meal') return renderMealModal();
}
function renderAirportModal() {
  const list = sortedAirports(state.activeRegion, state.airportQuery);
  const selectedCode = state[state.airportField];
  modalSheet.className = 'sheet airport-sheet';
  modalSheet.innerHTML = `
    <div class="sheet-header"><h2 class="sheet-title">출/도착지 선택</h2><button class="close-btn" onclick="closeModal()">×</button></div>
    <div class="airport-current">
      <div><div class="small-name">${h(airportLabel(state.origin))}</div><div class="big-code">${h(state.origin)}</div></div>
      <button class="modal-swap" onclick="modalSwapRoute()">↔</button>
      <div><div class="small-name">${h(airportLabel(state.destination))}</div><div class="big-code">${h(state.destination)}</div></div>
    </div>
    <div class="modal-search"><div class="search-field"><input placeholder="도시/공항명을 입력해 주세요." value="${h(state.airportQuery)}" oninput="setAirportQuery(this.value)" autofocus /><span class="search-icon">⌕</span></div></div>
    <div class="airport-columns">
      <div class="region-list">
        ${REGIONS.map(r => `<button class="region-btn ${!state.airportQuery && state.activeRegion===r?'active':''}" onclick="setRegion('${h(r)}')">${h(r)}</button>`).join('')}
      </div>
      <div class="airport-list">
        ${state.airportQuery ? `<div class="muted small" style="margin-bottom:8px">검색 결과</div>` : ''}
        ${list.length ? list.map(a => `
          <button class="airport-option ${selectedCode===a.airport_id?'selected':''}" onclick="selectAirport('${h(a.airport_id)}')">
            <div class="main">${h(airportOptionLabel(a))}</div>
            <div class="sub">${h(airportSub(a))}</div>
          </button>`).join('') : `<div class="empty-list">검색 결과가 없습니다.<br/>도시명 또는 IATA 코드를 다시 입력해 주세요.</div>`}
      </div>
    </div>`;
}
function renderPassengerModal() {
  const helpText = {
    child: '소아는 만 2세 이상~만 12세 미만 승객입니다. 데모 요금 계산에서는 성인 운임의 75%로 계산합니다.',
    infant: '유아는 생후 7일 이상~만 2세 미만 승객입니다. 데모 요금 계산에서는 성인 운임의 10%로 계산합니다. 유아는 일반 좌석/일반 기내식 선택 대상에서 제외됩니다.'
  };
  modalSheet.className = 'sheet passenger-sheet';
  modalSheet.innerHTML = `
    <div class="sheet-header"><h2 class="sheet-title">탑승객 선택</h2><button class="done-btn" onclick="closeModal()">완료</button></div>
    <div class="sheet-body" style="overflow:visible">
      ${state.helpKey ? `<div class="help-pop ${h(state.helpKey)}">${h(helpText[state.helpKey])}</div>` : ''}
      ${paxRow('adult','성인','만 12세 이상', state.pax.adult, false)}
      ${paxRow('child','소아','만 2세 이상~만 12세 미만', state.pax.child, true)}
      ${paxRow('infant','유아','생후 7일 이상~만 2세 미만', state.pax.infant, true)}
      <div class="safe-note">안전한 데모 운영을 위해 생년월일·주민번호·여권번호는 입력받지 않도록 설계했어요.</div>
    </div>`;
}
function paxRow(type, title, sub, count, help) {
  const disableMinus = type === 'adult' ? count <= 1 : count <= 0;
  const disablePlus = type === 'infant' ? count >= state.pax.adult : count >= 9;
  return `<div class="pax-row">
    <div><div class="pax-name">${h(title)}${help ? `<button class="help-btn" onclick="showHelp('${type}')">?</button>` : ''}</div><div class="pax-sub">${h(sub)}</div></div>
    <div class="counter"><button ${disableMinus?'disabled':''} onclick="changePax('${type}',-1)">−</button><span class="count">${count}</span><button ${disablePlus?'disabled':''} onclick="changePax('${type}',1)">+</button></div>
  </div>`;
}
function renderMealModal() {
  const passenger = passengerById(state.mealTarget.passengerId);
  const currentId = state.meals[state.mealTarget.sector]?.[state.mealTarget.passengerId] || 'none';
  modalSheet.className = 'sheet meal-sheet';
  modalSheet.innerHTML = `
    <div class="sheet-header"><h2 class="sheet-title">기내식 선택</h2><button class="close-btn" onclick="closeModal()">×</button></div>
    <div class="sheet-body meal-list-body">
      <div class="meal-rule-box">
        <b>${h(selectedFare().name)}</b> · ${h(selectedFare().mealPolicy)}<br/>
        ${h(sectorLabel(state.mealTarget.sector))} ${h(sectorRouteLabel(state.mealTarget.sector))} · ${h(passenger?.label || '탑승객')} 기준으로 1개 메뉴만 선택됩니다.
      </div>
      ${mealOptions.map(m => {
        const disabled = !mealIsSelectable(m, passenger);
        const price = m.id === 'none' ? '₩0' : mealPriceLabel(m, passenger);
        return `<div class="meal-option meal-card ${currentId===m.id?'selected':''} ${disabled?'disabled':''}" ${disabled?'':'onclick="setMeal(\'' + h(m.id) + '\')"'}>
          <div class="meal-photo ${m.image ? '' : 'empty'}">${m.image ? `<img src="${h(m.image)}" alt="${h(m.title)}">` : '—'}</div>
          <div class="meal-info"><div class="meal-meta"><span class="chip blue">${h(m.category)}</span>${m.childOnly ? '<span class="chip orange">소아 전용</span>' : ''}</div><div class="meal-title">${h(m.title)}</div><div class="meal-desc">${h(m.desc)}</div><div class="meal-price">${h(price)}</div>${disabled ? '<div class="meal-disabled-text">해당 탑승객에게 선택할 수 없는 메뉴입니다.</div>' : ''}</div>
        </div>`;
      }).join('')}
      <div class="safe-note">편도 기준 탑승객 1명당 1개 메뉴만 선택됩니다. 왕복은 가는 편과 오는 편을 각각 다르게 선택할 수 있어요.</div>
    </div>`;
}
function render() {
  syncPassengers();
  renderProgress();
  if (state.step === 0) return renderSearch();
  if (state.step === 1) return renderFlights();
  if (state.step === 2) return renderPassengerInfo();
  if (state.step === 3) return renderSeatStep();
  if (state.step === 4) return mealAvailable() ? renderMealStep() : renderPayment();
  if (state.step === 5) return renderPayment();
  return renderComplete();
}
function renderSearch() {
  app.innerHTML = `
    <section class="card">
      <h2 class="section-title">여행 검색</h2>
      <div class="trip-toggle"><button class="${state.tripType==='oneway'?'active':''}" onclick="setTripType('oneway')">편도</button><button class="${state.tripType==='roundtrip'?'active':''}" onclick="setTripType('roundtrip')">왕복</button></div>
      <div class="route-pickers">
        <button class="airport-box" onclick="openAirport('origin')"><span class="code">${h(state.origin)}</span><span class="label">${h(airportLabel(state.origin))}</span></button>
        <button class="swap-round" onclick="swapRoute()">↔</button>
        <button class="airport-box" onclick="openAirport('destination')"><span class="code">${h(state.destination)}</span><span class="label">${h(airportLabel(state.destination))}</span></button>
      </div>
      <div class="date-grid">
        <div class="field"><label>가는 날</label><input type="date" value="${h(state.departDate)}" onchange="state.departDate=this.value; resetSearchSelection(); render()" /></div>
        <div class="field ${state.tripType==='oneway'?'hidden':''}"><label>오는 날</label><input type="date" value="${h(state.returnDate)}" onchange="state.returnDate=this.value; resetSearchSelection(); render()" /></div>
      </div>
      <div class="field"><label>탑승객</label><button class="select-like" onclick="openModal('passenger')"><strong>${h(passengerSummary())}</strong><span>›</span></button></div>
      <button class="primary" onclick="resetSearchSelection(); go(1)">항공권 검색하기</button>
      <p class="notice">항공편 검색 가격은 보기 편하도록 기존 seed 운임보다 30% 낮춘 금액으로 표시됩니다. 유류할증료/공항세는 결제 직전 합산됩니다.</p>
    </section>
    <section class="card"><h2 class="section-title">v8 포인트</h2><span class="chip blue">카드형 공항 팝업</span><span class="chip green">3개 항공사 유형</span><span class="chip purple">탑승객별 기내식</span><span class="chip orange">DEMO 안전 표시</span></section>`;
}
function renderFlights() {
  const outbound = currentOutboundOptions();
  const inbound = currentInboundOptions();
  const outSelected = selectedOutbound();
  app.innerHTML = `
    <section class="card">
      <div class="row"><h2 class="section-title">항공편 선택</h2><button class="secondary" style="width:auto;padding:9px 12px" onclick="go(0)">수정</button></div>
      <p class="muted">${h(airportLabel(state.origin))} → ${h(airportLabel(state.destination))} · ${state.tripType === 'roundtrip' ? '왕복' : '편도'} · ${h(passengerSummary())}</p>
    </section>
    <section class="card"><h2 class="section-title">가는 항공편</h2><p class="section-caption">저가/기본/대형 항공사 유형별로 1개씩 보여줘요.</p>${outbound.map(f => flightCard(f, 'outbound', state.outboundId)).join('')}</section>
    ${state.tripType === 'roundtrip' ? `<section class="card"><h2 class="section-title">오는 항공편</h2>${outSelected ? `<p class="section-caption">${h(airportLabel(state.destination))} → ${h(airportLabel(state.origin))} 복귀편입니다.</p>${inbound.map(f => flightCard(f, 'inbound', state.inboundId)).join('')}` : `<p class="muted">가는 항공편을 먼저 선택하면 오는 항공편 3개가 표시됩니다.</p>`}</section>` : ''}
    <section class="card">
      <h2 class="section-title">운임 선택</h2>
      ${fareRules.map(f => fareCard(f)).join('')}
      ${mealAvailable() ? `<div class="meal-choice"><b>기내식 선택:</b> 좌석 선택 후 별도 단계에서 ${h(sectorCount())}개 구간 × ${h(seatPassengerCount())}명 기준으로 탑승객별 선택<br/><div class="muted small" style="margin-top:6px">Standard는 메뉴 가격이 추가 결제되고, Flex는 추가요금 없이 선택됩니다.</div></div>` : `<div class="muted">Basic 운임은 기내식 선택 단계를 건너뛰고 좌석 선택 후 결제 확인으로 이동합니다.</div>`}
      <div style="height:12px"></div>
      <button class="primary" ${canProceedFare() ? '' : 'disabled'} onclick="go(2)">탑승객 정보 입력</button>
    </section>`;
}
function flightCard(f, kind, selectedId) {
  const airline = airlineById[f.airline_id] || {};
  const brand = airline.brand_color || '#2563eb';
  const logo = airline.logo_text || (f.airline_id || 'AM').slice(0,2);
  const type = f.airline_type || airline.airline_type || 'standard';
  return `<div class="flight-card ${selectedId===f.flight_id?'selected':''}" onclick="selectFlight('${kind}','${h(f.flight_id)}')">
    <div class="flight-top">
      <div class="airline-line"><div class="airline-logo" style="background:${h(brand)}">${h(logo)}</div><div><div class="airline">${h(f.airline_name)}</div><div class="muted small">${h(f.flight_number)} · ${h(f.aircraft)}${f.synthetic ? ' · 데모 편성' : ''}</div></div></div>
      <div><div class="original-price">${won(f.base_fare_krw)}</div><div class="price">${won(displayFare(f))}</div></div>
    </div>
    <div class="route"><div><div class="time">${h(fmtTime(f.departure_at))}</div><div class="airport">${h(f.departure_airport_id)}</div></div><div class="line-plane">✈</div><div style="text-align:right"><div class="time">${h(fmtTime(f.arrival_at))}</div><div class="airport">${h(f.arrival_airport_id)}</div></div></div>
    <div class="row"><span class="muted">직항 · ${h(durationText(f.duration_minutes))}</span><span><span class="chip ${TYPE_CHIP[type] || 'blue'}">${h(TYPE_LABEL[type] || f.airline_type_ko)}</span><span class="chip">잔여 ${h(f.available_seats || 0)}석</span></span></div>
  </div>`;
}
function fareCard(f) {
  return `<div class="fare ${state.fareId===f.id?'selected':''}" onclick="setFare('${f.id}')"><div class="row"><b>${h(f.name)}</b><b>${f.add ? '+' + won(f.add) : '포함'}</b></div><div>${f.perks.map(p => `<span class="chip">${h(p)}</span>`).join('')}</div><p class="muted small" style="margin:8px 0 0">${h(f.mealPolicy)}</p></div>`;
}
function renderPassengerInfo() {
  app.innerHTML = `
    <section class="card"><div class="row"><h2 class="section-title">탑승객 정보</h2><button class="secondary" style="width:auto;padding:9px 12px" onclick="go(1)">이전</button></div>
      <p class="section-caption">탑승객 수에 맞춰 정보를 각각 입력합니다. 성/이름/연락처를 모두 입력해야 다음 단계로 이동할 수 있어요.</p>
      ${renderPassengerForms()}
      <button class="primary" onclick="handlePassengerInfoNext()">좌석 선택으로</button>
    </section>`;
}
function renderPassengerForms() {
  return passengerList().map(p => passengerFormCard(p)).join('');
}
function passengerInputHtml(p, key, label, placeholder, extra='') {
  const error = passengerFieldError(p, key);
  return `<div class="field${passengerFieldClass(p, key)}"><label>${h(label)}</label><input ${extra} placeholder="${h(placeholder)}" value="${h(p[key])}" oninput="updatePassengerProfile('${h(p.id)}','${h(key)}',this.value,this);" /><div class="field-error">${h(error)}</div></div>`;
}
function passengerFormCard(p) {
  const note = p.type === 'infant' ? '<div class="muted small" style="margin-top:6px">유아는 일반 좌석/기내식 선택 없이 보호자 동반 탑승으로 표시됩니다.</div>' : '';
  return `<div class="pax-process-card">
    <div class="row"><b>${h(p.label)}</b><span class="chip ${p.type==='adult'?'blue':p.type==='child'?'orange':'green'}">${h(p.typeKo)}</span></div>
    <div class="grid-2">${passengerInputHtml(p, 'lastName', '성/Last name', '성')}${passengerInputHtml(p, 'firstName', '이름/First name', '이름')}</div>
    ${passengerInputHtml(p, 'phone', '연락처', '010-0000-0000', 'inputmode="numeric" maxlength="13"')}${note}
  </div>`;
}
function renderSeatStep() {
  ensureSeatDefaults();
  app.innerHTML = `
    ${renderSeatSelection()}
    <section class="card"><h2 class="section-title">좌석 선택 요약</h2>${summaryMini()}<button class="primary" ${canProceedSeats() ? '' : 'disabled'} onclick="nextStepAfterSeats()">${mealAvailable() ? '기내식 선택으로' : '결제 확인으로'}</button></section>`;
}
function renderMealStep() {
  app.innerHTML = `
    ${renderMealSelection()}
    <section class="card"><h2 class="section-title">기내식 선택 요약</h2>${summaryMini()}<button class="primary" onclick="go(5)">결제 확인으로</button></section>`;
}
function renderMealSelection() {
  if (!mealAvailable()) {
    return `<section class="card"><div class="row"><h2 class="section-title">기내식 선택</h2><button class="secondary" style="width:auto;padding:9px 12px" onclick="go(3)">이전</button></div><p class="muted">Basic 운임은 기내식 선택 옵션이 제공되지 않습니다.</p></section>`;
  }
  const mealRows = sectors().map(sector => `
    <div class="pax-process-card">
      <div class="row"><div><b>${h(sectorLabel(sector))}</b><div class="muted small">${h(sectorRouteLabel(sector))}</div></div><span class="chip blue">편도 기준 1인 1개</span></div>
      <div class="copy-actions">
        <button class="ghost" onclick="applyFirstMealToSector('${sector}')">첫 탑승객 메뉴를 이 편 전체에 적용</button>
        ${sector === 'outbound' && state.tripType === 'roundtrip' ? `<button class="ghost" onclick="copyOutboundMealsToInbound()">가는 편 메뉴를 오는 편에도 적용</button>` : ''}
      </div>
      ${seatPassengers().map(p => mealSelectionRow(sector, p)).join('')}
    </div>`).join('');
  return `<section class="card"><div class="row"><h2 class="section-title">기내식 선택</h2><button class="secondary" style="width:auto;padding:9px 12px" onclick="go(3)">이전</button></div>
    <div class="meal-rule-box"><b>${h(selectedFare().name)}</b> · ${h(selectedFare().mealPolicy)}<br/>좌석 선택 후 기내식을 선택하는 단계입니다. 탑승객별로 가는 편/오는 편 메뉴를 각각 다르게 선택할 수 있어요.</div>
    ${mealRows}
  </section>`;
}
function mealSelectionRow(sector, p) {
  const meal = mealFor(sector, p.id);
  return `<div class="pax-meal-row">
    <div><b>${h(p.label)}</b><div class="muted small">${meal.id === 'none' ? '선택 안 함' : `${h(meal.title)} · ${h(mealPriceLabel(meal, p))}`}</div></div>
    <button class="ghost" onclick="openMealPicker('${sector}','${h(p.id)}')">${meal.id === 'none' ? '선택' : '변경'}</button>
  </div>`;
}
function renderSeatSelection() {
  return `<section class="card"><div class="row"><h2 class="section-title">좌석 선택</h2><button class="secondary" style="width:auto;padding:9px 12px" onclick="go(2)">이전</button></div><p class="section-caption">한 페이지에서 탑승객을 전환하며 좌석을 복수 선택합니다. 왕복은 가는 편 탑승객 전원 좌석 선택 후 오는 편 좌석을 선택할 수 있어요.</p>
    ${sectors().map(sector => renderSeatSector(sector)).join('')}
  </section>`;
}
function renderSeatSector(sector) {
  const f = flightForSector(sector);
  if (!f) return '';
  if (sector === 'inbound' && state.tripType === 'roundtrip' && !sectorSeatComplete('outbound')) {
    return `<div class="pax-process-card seat-sector-card locked"><div class="row"><div><b>오는 편 좌석</b><div class="muted small">가는 편 탑승객 좌석을 모두 선택하면 열립니다.</div></div><span class="chip">대기</span></div></div>`;
  }
  const pax = seatPassengers();
  const targetId = state.seatTargetBySector[sector] || pax[0]?.id || '';
  const target = passengerById(targetId) || pax[0];
  return `<div class="pax-process-card seat-sector-card">
    <div class="row"><div><b>${h(sectorLabel(sector))} 좌석</b><div class="muted small">${h(f.flight_number)} · ${h(f.departure_airport_id)}→${h(f.arrival_airport_id)}</div></div><span class="chip ${TYPE_CHIP[f.airline_type] || 'blue'}">${h(TYPE_LABEL[f.airline_type] || f.airline_type_ko)}</span></div>
    <div class="seat-target-tabs">${pax.map(p => `<button class="${target?.id===p.id?'active':''}" onclick="setSeatTarget('${sector}','${h(p.id)}')">${h(p.label)} <small>${h(state.seats[sector]?.[p.id] || '-')}</small></button>`).join('')}</div>
    <div class="muted small" style="margin:8px 0 10px">현재 선택 대상: <b>${h(target?.label || '')}</b></div>
    ${renderSeatMap(f.airline_type, sector, target?.id || '')}
  </div>`;
}
function layoutForType(type) {
  if (type === 'major') return { type:'major', rows:24, blocks:['AB','CDEF','GH'], flexRows:4, wingAfter:11, label:'대형 항공 · 2-4-2 와이드바디' };
  if (type === 'low_cost') return { type:'low_cost', rows:18, blocks:['ABC','DEF'], flexRows:2, wingAfter:8, label:'저가 항공 · 3-3 컴팩트 기내' };
  return { type:'standard', rows:22, blocks:['ABC','DEF'], flexRows:3, wingAfter:9, label:'기본 항공 · 3-3 표준 기내' };
}
function isFlexZoneSeat(seat, type) {
  const row = parseInt(String(seat).match(/^\d+/)?.[0] || '0', 10);
  return row > 0 && row <= layoutForType(type).flexRows;
}
function isFareBlockedSeat(seat, type) {
  const isFlex = isFlexZoneSeat(seat, type);
  return selectedFare().id === 'flex' ? !isFlex : isFlex;
}
function isBlockedSeat(seat) {
  let sum = 0; for (const ch of seat) sum += ch.charCodeAt(0);
  return sum % 11 === 0 || ['1A','1B','2C','3D'].includes(seat);
}
function isTakenSeat(sector, passengerId, seat) {
  return Object.entries(state.seats[sector] || {}).some(([id, value]) => id !== passengerId && value === seat);
}
function isSeatUnavailable(seat, type, sector, passengerId) { return isBlockedSeat(seat) || isFareBlockedSeat(seat, type) || isTakenSeat(sector, passengerId, seat); }
function firstSeatFor(sector, passengerId) {
  const f = flightForSector(sector) || selectedOutbound() || currentOutboundOptions()[0];
  const layout = layoutForType(f.airline_type);
  for (let r=1; r<=layout.rows; r++) {
    for (const block of layout.blocks) {
      for (const col of block) {
        const seat = `${r}${col}`;
        if (!isSeatUnavailable(seat, layout.type, sector, passengerId)) return seat;
      }
    }
  }
  return '';
}
function ensureSeatDefaults(force=false) {
  syncPassengers();
  sectors().forEach(sector => {
    const f = flightForSector(sector);
    if (!f) return;
    state.seats[sector] ||= {};
    seatPassengers().forEach(p => {
      const cur = state.seats[sector]?.[p.id] || '';
      if (cur && (force || isSeatUnavailable(cur, f.airline_type, sector, p.id))) state.seats[sector][p.id] = '';
    });
  });
  const firstSeat = state.seats.outbound?.[seatPassengers()[0]?.id];
  state.seat = firstSeat || '';
}
function setSeatTarget(sector, passengerId) { state.seatTargetBySector[sector] = passengerId; render(); }
function selectSeat(sector, passengerId, seat) {
  state.seats[sector][passengerId] = seat;
  if (sector === 'outbound' && passengerId === seatPassengers()[0]?.id) state.seat = seat;
  const next = seatPassengers().find(p => !state.seats[sector]?.[p.id]);
  if (next) state.seatTargetBySector[sector] = next.id;
  else if (sector === 'outbound' && state.tripType === 'roundtrip') {
    const inboundNext = seatPassengers().find(p => !state.seats.inbound?.[p.id]) || seatPassengers()[0];
    if (inboundNext) state.seatTargetBySector.inbound = inboundNext.id;
  }
  render();
}
function renderSeatMap(type, sector, passengerId) {
  const layout = layoutForType(type);
  const selectedSeat = state.seats[sector]?.[passengerId] || '';
  let rows = '';
  for (let r=1; r<=layout.rows; r++) {
    const seats = [];
    layout.blocks.forEach((block, bi) => {
      if (bi > 0) seats.push('<div class="aisle"><span></span></div>');
      for (const col of block) {
        const seat = `${r}${col}`;
        const sold = isBlockedSeat(seat);
        const fareBlocked = isFareBlockedSeat(seat, layout.type);
        const taken = isTakenSeat(sector, passengerId, seat);
        const blocked = sold || fareBlocked || taken;
        const zone = r <= layout.flexRows ? 'flex-seat' : 'economy-seat';
        const title = fareBlocked ? (selectedFare().id === 'flex' ? 'Flex 운임은 Flex 구역만 선택할 수 있습니다.' : 'Flex 운임 전용 구역입니다.') : taken ? '이미 다른 탑승객이 선택한 좌석입니다.' : sold ? '이미 선택된 좌석입니다.' : '';
        seats.push(`<button title="${h(title)}" class="seat ${zone} ${selectedSeat===seat?'selected':''} ${blocked?'blocked':''} ${fareBlocked?'fare-blocked':''}" ${blocked?'disabled':''} onclick="selectSeat('${sector}','${h(passengerId)}','${seat}')">${seat}</button>`);
      }
    });
    const rowZone = r <= layout.flexRows ? 'flex-zone-row' : 'economy-zone-row';
    rows += `<div class="seat-row ${layout.type} ${rowZone}"><div class="row-num">${r}</div>${seats.join('')}</div>`;
    if (r === layout.flexRows) rows += `<div class="zone-divider">Flex Zone / 일반 좌석 구역</div>`;
    if (r === layout.wingAfter) rows += `<div class="wing-label">◇ WING AREA ◇</div>`;
  }
  return `<div class="aircraft-model ${layout.type}"><div class="aircraft-nose"><span>COCKPIT</span></div><div class="aircraft-wing left"></div><div class="aircraft-wing right"></div><div class="seat-cabin ${layout.type}"><div class="cabin-label">${h(layout.label)}</div><div class="seat-legend"><span><i class="legend-flex"></i>Flex 구역</span><span><i class="legend-selected"></i>선택</span><span><i class="legend-blocked"></i>선택불가</span></div>${rows}</div><div class="aircraft-tail">TAIL</div></div>`;
}
function summaryMini() {
  const out = selectedOutbound(); const inbound = selectedInbound();
  const seatSummary = sectors().map(sector => `${sectorLabel(sector)} ${seatPassengers().map(p => `${p.label} ${state.seats[sector]?.[p.id] || '-'}`).join(', ')}`).join('<br/>');
  return `<div class="summary-line"><span>가는 편</span><b>${h(out.flight_number)} · ${h(out.departure_airport_id)}→${h(out.arrival_airport_id)}</b></div>${state.tripType==='roundtrip' && inbound ? `<div class="summary-line"><span>오는 편</span><b>${h(inbound.flight_number)} · ${h(inbound.departure_airport_id)}→${h(inbound.arrival_airport_id)}</b></div>` : ''}<div class="summary-line"><span>운임</span><b>${h(selectedFare().name)}</b></div>${mealAvailable() ? `<div class="summary-line"><span>기내식</span><b>${h(mealSummaryLabel())}</b></div>` : ''}<div class="summary-line"><span>좌석</span><b>${seatSummary}</b></div>`;
}
function renderPayment() {
  state.reviewTab ||= 'route';
  app.innerHTML = `
    <section class="card"><div class="row"><h2 class="section-title">결제 전 최종 확인</h2><button class="secondary" style="width:auto;padding:9px 12px" onclick="go(mealAvailable()?4:3)">이전</button></div><div class="paybox">카드번호, CVC, 주민번호, 여권번호를 받지 않는 체험용 결제 화면입니다. 실제 결제는 발생하지 않습니다.</div></section>
    <section class="card"><h2 class="section-title">확인 탭</h2>${renderReviewTabs()}${renderReviewContent()}</section>
    <section class="card"><h2 class="section-title">결제수단</h2><div class="fare selected"><div class="row"><b>Demo Pay</b><span class="chip orange">실제 청구 없음</span></div><p class="muted">버튼을 누르면 예약번호와 탑승객별 데모 탑승권 화면이 생성됩니다.</p></div><button class="primary" onclick="makeBookingCode(); go(6)">실제 결제 없이 발권 체험하기</button><p class="notice">실서비스와 혼동되지 않도록 모든 발급물에 DEMO 문구를 유지합니다.</p></section>`;
}
function renderReviewTabs() {
  const tabs = [ ['route','여정'], ['passengers','탑승객'], ['meals','기내식'], ['seats','좌석'], ['price','금액'] ];
  return `<div class="review-tabs">${tabs.map(([id,label]) => `<button class="review-tab ${state.reviewTab===id?'active':''}" onclick="setReviewTab('${id}')">${label}</button>`).join('')}</div>`;
}
function renderReviewContent() {
  if (state.reviewTab === 'route') return reviewRoute();
  if (state.reviewTab === 'passengers') return reviewPassengers();
  if (state.reviewTab === 'meals') return reviewMeals();
  if (state.reviewTab === 'seats') return reviewSeats();
  return reviewPrice();
}
function reviewRoute() {
  return `<div class="review-panel">${sectors().map(sector => {
    const f = flightForSector(sector);
    return `<div class="summary-line"><span>${h(sectorLabel(sector))}</span><b>${h(f.flight_number)} · ${h(f.departure_airport_id)}→${h(f.arrival_airport_id)} · ${h(fmtTime(f.departure_at))}</b></div>`;
  }).join('')}</div>`;
}
function passengerName(p) {
  const name = `${p.lastName || ''}/${p.firstName || ''}`.replace(/^\/$/, '');
  return name || p.label;
}
function reviewPassengers() {
  return `<div class="review-panel">${passengerList().map(p => `<div class="summary-line"><span>${h(p.label)}</span><b>${h(passengerName(p))}</b></div>`).join('')}</div>`;
}
function reviewMeals() {
  if (!mealAvailable()) return `<div class="review-panel"><p class="muted">Basic 운임은 기내식 선택 옵션이 제공되지 않습니다.</p></div>`;
  return `<div class="review-panel">${sectors().map(sector => `<div class="review-subtitle">${h(sectorLabel(sector))}</div>${seatPassengers().map(p => { const meal = mealFor(sector, p.id); return `<div class="summary-line"><span>${h(p.label)}</span><b>${h(meal.title)}${meal.id !== 'none' ? ` · ${h(mealPriceLabel(meal, p))}` : ''}</b></div>`; }).join('')}`).join('')}</div>`;
}
function reviewSeats() {
  return `<div class="review-panel">${sectors().map(sector => `<div class="review-subtitle">${h(sectorLabel(sector))}</div>${seatPassengers().map(p => `<div class="summary-line"><span>${h(p.label)}</span><b>${h(state.seats[sector]?.[p.id] || '-')}</b></div>`).join('')}`).join('')}</div>`;
}
function reviewPrice() {
  const aggs = mealAggregates();
  return `<div class="review-panel">
    <div class="summary-line"><span>항공권 운임 × 승객요율</span><b>${won(fareBaseTotal())}</b></div>
    <div class="summary-line"><span>${h(selectedFare().name)} 운임 추가</span><b>${won(fareAddTotal())}</b></div>
    ${mealAvailable() ? `<div class="summary-line"><span>기내식 선택</span><b>${h(mealSummaryLabel())}</b></div>` : ''}
    ${mealAvailable() && aggs.length ? aggs.map(a => `<div class="summary-line"><span>${h(a.meal.title)} × ${a.count}</span><b>${selectedFare().id === 'flex' ? 'Flex 포함' : won(a.total)}</b></div>`).join('') : ''}
    ${mealAvailable() && selectedFare().id === 'flex' && mealQuantity() ? `<div class="summary-line"><span>Flex 기내식 혜택</span><b>추가요금 없음</b></div>` : ''}
    <div class="summary-line"><span>공항세/유류할증료 데모</span><b>${won(fuelTaxTotal())}</b></div>
    <div class="summary-line total"><span>총 결제 체험 금액</span><b>${won(totalPrice())}</b></div>
  </div>`;
}
function renderComplete() {
  const passCount = passengerList().length * sectorCount();
  app.innerHTML = `
    <section class="card"><h2 class="section-title">발권 체험 완료</h2><p class="muted">탑승객 수와 구간에 맞춰 데모 보딩패스를 발급했어요. 이제 이메일 입력 없이 PNG 파일로 바로 저장할 수 있습니다.</p></section>
    <section class="card download-panel"><h2 class="section-title">보딩패스 PNG 저장</h2><p class="section-caption">개별 저장은 보딩패스마다 1장씩 저장하고, 전체 저장은 현재 발급된 보딩패스 ${passCount}장을 각각 PNG 파일로 한 번에 저장합니다.</p><button class="primary" onclick="downloadAllBoardingPassPng()">전체 PNG 저장</button><p class="notice">여러 장을 한 번에 저장할 때 브라우저가 여러 파일 다운로드 허용을 요청할 수 있습니다.</p></section>
    ${boardingPassesHtml()}
    <div class="footer-actions"><button class="secondary" onclick="go(0)">처음으로</button><button class="primary" onclick="downloadAllBoardingPassPng()">전체 PNG 저장</button></div>`;
}
function boardingPassesHtml() {
  return boardingPassItems().map(item => `
    <div class="boarding-download-wrap">
      ${boardingPassHtml(item.f, item.sector, item.p, item.index, boardingPassFileName(item))}
      <button class="ghost download-one-btn" onclick="downloadBoardingPassPng(${item.index})">이 보딩패스 PNG 저장</button>
    </div>
  `).join('');
}
function boardingPassHtml(f, sector, p, index = 0, fileName = '') {
  const seat = p.type === 'infant' ? 'INF' : (state.seats[sector]?.[p.id] || '-');
  const meal = p.type === 'infant' ? null : mealFor(sector, p.id);
  const mealBlock = mealAvailable() && meal && meal.id !== 'none' ? `<div><label>Meal</label><b>기내식-${h(meal.title)}</b></div>` : '';
  return `<section class="boarding boarding-stack boarding-pass-capture" id="boarding-pass-${index}" data-file-name="${h(fileName)}"><div class="boarding-head"><b>BOARDING PASS · ${h(sectorLabel(sector))}</b><span class="watermark">DEMO</span></div><div class="boarding-body"><div class="muted small">Passenger</div><b>${h(passengerName(p))}</b><div class="big-route"><div><div class="big-code">${h(f.departure_airport_id)}</div><div class="muted">${h(airportLabel(f.departure_airport_id))}</div></div><div>✈️</div><div style="text-align:right"><div class="big-code">${h(f.arrival_airport_id)}</div><div class="muted">${h(airportLabel(f.arrival_airport_id))}</div></div></div><div class="grid-2"><div><label>Flight</label><b>${h(f.flight_number)}</b></div><div><label>Seat</label><b>${h(seat)}</b></div><div><label>Date</label><b>${h(dateForSector(sector))}</b></div><div><label>Gate</label><b>D${Math.floor(Math.random()*20)+1}</b></div><div><label>Boarding</label><b>${h(fmtTime(f.departure_at))}</b></div><div><label>Booking</label><b>${h(state.bookingCode)}</b></div>${mealBlock}</div><div class="qr">DEMO QR</div></div></section>`;
}
syncPassengers();
render();
