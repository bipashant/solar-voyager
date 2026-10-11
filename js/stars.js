// Bright-star catalogue (J2000 RA/Dec, visual magnitude, B−V colour index) and constellation figures.
// The Milky Way panorama already contains the faint stars; these are drawn crisp on top of it.

const RAW = [
  // Orion
  ['Betelgeuse', '05 55 10.3', '+07 24 25', 0.50, 1.85], ['Rigel', '05 14 32.3', '-08 12 06', 0.13, -0.03],
  ['Bellatrix', '05 25 07.9', '+06 20 59', 1.64, -0.22], ['Saiph', '05 47 45.4', '-09 40 11', 2.09, -0.17],
  ['Mintaka', '05 32 00.4', '-00 17 57', 2.23, -0.22], ['Alnilam', '05 36 12.8', '-01 12 07', 1.69, -0.18],
  ['Alnitak', '05 40 45.5', '-01 56 34', 1.77, -0.21], ['Meissa', '05 35 08.3', '+09 56 03', 3.33, -0.18],
  // Ursa Major
  ['Dubhe', '11 03 43.7', '+61 45 03', 1.79, 1.07], ['Merak', '11 01 50.5', '+56 22 57', 2.37, -0.02],
  ['Phecda', '11 53 49.8', '+53 41 41', 2.44, 0.04], ['Megrez', '12 15 25.6', '+57 01 57', 3.31, 0.08],
  ['Alioth', '12 54 01.7', '+55 57 35', 1.77, -0.02], ['Mizar', '13 23 55.5', '+54 55 31', 2.23, 0.02],
  ['Alkaid', '13 47 32.4', '+49 18 48', 1.86, -0.19],
  // Ursa Minor
  ['Polaris', '02 31 49.1', '+89 15 51', 1.98, 0.60], ['Yildun', '17 32 13.0', '+86 35 11', 4.36, 0.02],
  ['Epsilon UMi', '16 45 58.2', '+82 02 14', 4.21, 0.89], ['Zeta UMi', '15 44 03.5', '+77 47 40', 4.29, 0.04],
  ['Eta UMi', '16 17 30.3', '+75 45 19', 4.95, 0.37], ['Pherkad', '15 20 43.7', '+71 50 02', 3.05, 0.05],
  ['Kochab', '14 50 42.3', '+74 09 20', 2.08, 1.47],
  // Cassiopeia
  ['Caph', '00 09 10.7', '+59 08 59', 2.27, 0.34], ['Schedar', '00 40 30.4', '+56 32 14', 2.24, 1.17],
  ['Navi', '00 56 42.5', '+60 43 00', 2.47, -0.15], ['Ruchbah', '01 25 49.0', '+60 14 07', 2.68, 0.13],
  ['Segin', '01 54 23.7', '+63 40 12', 3.37, -0.15],
  // Cygnus
  ['Deneb', '20 41 25.9', '+45 16 49', 1.25, 0.09], ['Sadr', '20 22 13.7', '+40 15 24', 2.23, 0.67],
  ['Aljanah', '20 46 12.7', '+33 58 13', 2.48, 1.03], ['Fawaris', '19 44 58.5', '+45 07 51', 2.87, -0.03],
  ['Albireo', '19 30 43.3', '+27 57 35', 3.08, 1.13],
  // Lyra
  ['Vega', '18 36 56.3', '+38 47 01', 0.03, 0.00], ['Sheliak', '18 50 04.8', '+33 21 46', 3.52, 0.00],
  ['Sulafat', '18 58 56.6', '+32 41 22', 3.25, -0.05], ['Zeta Lyr', '18 44 46.3', '+37 36 18', 4.36, 0.19],
  ['Delta Lyr', '18 54 30.3', '+36 53 55', 4.30, 1.68],
  // Aquila
  ['Altair', '19 50 47.0', '+08 52 06', 0.76, 0.22], ['Tarazed', '19 46 15.6', '+10 36 48', 2.72, 1.52],
  ['Alshain', '19 55 18.8', '+06 24 24', 3.71, 0.86], ['Okab', '19 05 24.6', '+13 51 48', 2.99, 0.01],
  ['Delta Aql', '19 25 29.9', '+03 06 53', 3.36, 0.32], ['Theta Aql', '20 11 18.3', '-00 49 17', 3.26, -0.07],
  ['Lambda Aql', '19 06 14.9', '-04 52 57', 3.43, -0.09],
  // Scorpius
  ['Antares', '16 29 24.5', '-26 25 55', 0.96, 1.83], ['Acrab', '16 05 26.2', '-19 48 19', 2.62, -0.07],
  ['Dschubba', '16 00 20.0', '-22 37 18', 2.29, -0.12], ['Fang', '15 58 51.1', '-26 06 51', 2.89, -0.19],
  ['Alniyat', '16 21 11.3', '-25 35 34', 2.89, 0.13], ['Paikauhale', '16 35 53.0', '-28 12 58', 2.82, -0.25],
  ['Larawag', '16 50 10.2', '-34 17 36', 2.29, 1.15], ['Mu1 Sco', '16 51 52.2', '-38 02 51', 3.04, -0.20],
  ['Zeta2 Sco', '16 54 35.0', '-42 21 41', 3.62, 1.37], ['Eta Sco', '17 12 09.2', '-43 14 21', 3.33, 0.41],
  ['Sargas', '17 37 19.1', '-42 59 52', 1.86, 0.40], ['Iota1 Sco', '17 47 35.1', '-40 07 37', 2.99, 0.51],
  ['Girtab', '17 42 29.3', '-39 01 48', 2.39, -0.17], ['Shaula', '17 33 36.5', '-37 06 14', 1.62, -0.22],
  ['Lesath', '17 30 45.8', '-37 17 45', 2.69, -0.18],
  // Sagittarius
  ['Kaus Australis', '18 24 10.3', '-34 23 05', 1.85, -0.03], ['Nunki', '18 55 15.9', '-26 17 48', 2.05, -0.13],
  ['Kaus Media', '18 20 59.6', '-29 49 41', 2.70, 1.38], ['Kaus Borealis', '18 27 58.2', '-25 25 18', 2.81, 1.02],
  ['Alnasl', '18 05 48.5', '-30 25 27', 2.98, 1.00], ['Ascella', '19 02 36.7', '-29 52 48', 2.60, 0.08],
  ['Phi Sgr', '18 45 39.4', '-26 59 27', 3.17, -0.11], ['Tau Sgr', '19 06 56.4', '-27 40 13', 3.32, 1.19],
  // Crux
  ['Acrux', '12 26 35.9', '-63 05 57', 0.76, -0.24], ['Mimosa', '12 47 43.3', '-59 41 19', 1.25, -0.23],
  ['Gacrux', '12 31 09.9', '-57 06 48', 1.63, 1.60], ['Imai', '12 15 08.7', '-58 44 56', 2.79, -0.23],
  // Centaurus
  ['Rigil Kentaurus', '14 39 36.5', '-60 50 02', -0.27, 0.71], ['Hadar', '14 03 49.4', '-60 22 23', 0.61, -0.23],
  ['Menkent', '14 06 40.9', '-36 22 12', 2.06, 1.01], ['Muhlifain', '12 41 31.0', '-48 57 35', 2.17, -0.01],
  ['Epsilon Cen', '13 39 53.3', '-53 27 59', 2.30, -0.22], ['Eta Cen', '14 35 30.4', '-42 09 28', 2.31, -0.19],
  ['Zeta Cen', '13 55 32.4', '-47 17 18', 2.55, -0.18], ['Delta Cen', '12 08 21.5', '-50 43 21', 2.52, -0.13],
  // Canis Major / Minor
  ['Sirius', '06 45 08.9', '-16 42 58', -1.46, 0.00], ['Mirzam', '06 22 42.0', '-17 57 21', 1.98, -0.24],
  ['Adhara', '06 58 37.5', '-28 58 20', 1.50, -0.21], ['Wezen', '07 08 23.5', '-26 23 36', 1.83, 0.68],
  ['Aludra', '07 24 05.7', '-29 18 11', 2.45, -0.08], ['Furud', '06 20 18.8', '-30 03 48', 3.02, -0.19],
  ['Omicron2 CMa', '07 03 01.5', '-23 50 00', 3.02, -0.08],
  ['Procyon', '07 39 18.1', '+05 13 30', 0.34, 0.42], ['Gomeisa', '07 27 09.0', '+08 17 21', 2.89, -0.09],
  // Gemini
  ['Castor', '07 34 36.0', '+31 53 18', 1.58, 0.03], ['Pollux', '07 45 18.9', '+28 01 34', 1.14, 1.00],
  ['Alhena', '06 37 42.7', '+16 23 57', 1.93, 0.00], ['Mebsuta', '06 43 55.9', '+25 07 52', 2.98, 1.38],
  ['Tejat', '06 22 57.6', '+22 30 49', 2.87, 1.64], ['Propus', '06 14 52.7', '+22 30 24', 3.28, 1.60],
  ['Wasat', '07 20 07.4', '+21 58 56', 3.53, 0.34], ['Mekbuda', '07 04 06.5', '+20 34 13', 3.79, 0.79],
  ['Alzirr', '06 45 17.4', '+12 53 44', 3.36, 0.43], ['Kappa Gem', '07 44 26.8', '+24 23 53', 3.57, 0.93],
  // Taurus
  ['Aldebaran', '04 35 55.2', '+16 30 33', 0.86, 1.54], ['Elnath', '05 26 17.5', '+28 36 27', 1.65, -0.13],
  ['Tianguan', '05 37 38.7', '+21 08 33', 3.00, -0.19], ['Ain', '04 28 37.0', '+19 10 50', 3.53, 1.01],
  ['Prima Hyadum', '04 19 47.6', '+15 37 39', 3.65, 0.99], ['Delta1 Tau', '04 22 56.1', '+17 32 33', 3.76, 0.98],
  ['Lambda Tau', '04 00 40.8', '+12 29 25', 3.47, -0.12], ['Alcyone', '03 47 29.1', '+24 06 18', 2.87, -0.09],
  // Leo
  ['Regulus', '10 08 22.3', '+11 58 02', 1.40, -0.11], ['Denebola', '11 49 03.6', '+14 34 19', 2.11, 0.09],
  ['Algieba', '10 19 58.4', '+19 50 29', 2.08, 1.13], ['Zosma', '11 14 06.5', '+20 31 25', 2.56, 0.12],
  ['Chertan', '11 14 14.4', '+15 25 46', 3.33, -0.01], ['Eta Leo', '10 07 19.9', '+16 45 45', 3.48, -0.03],
  ['Adhafera', '10 16 41.4', '+23 25 02', 3.44, 0.31], ['Rasalas', '09 52 45.8', '+26 00 25', 3.88, 1.22],
  ['Algenubi', '09 45 51.1', '+23 46 27', 2.98, 0.81],
  // Boötes
  ['Arcturus', '14 15 39.7', '+19 10 57', -0.05, 1.23], ['Izar', '14 44 59.2', '+27 04 27', 2.37, 0.97],
  ['Muphrid', '13 54 41.1', '+18 23 52', 2.68, 0.58], ['Seginus', '14 32 04.7', '+38 18 30', 3.03, 0.19],
  ['Nekkar', '15 01 56.8', '+40 23 26', 3.49, 0.97], ['Delta Boo', '15 15 30.2', '+33 18 53', 3.47, 0.95],
  ['Rho Boo', '14 31 49.8', '+30 22 17', 3.58, 1.30],
  // Corona Borealis
  ['Alphecca', '15 34 41.3', '+26 42 53', 2.23, -0.02], ['Nusakan', '15 27 49.7', '+29 06 21', 3.68, 0.28],
  ['Theta CrB', '15 32 55.8', '+31 21 33', 4.14, -0.12], ['Gamma CrB', '15 42 44.6', '+26 17 44', 3.84, 0.00],
  ['Delta CrB', '15 49 35.6', '+26 04 06', 4.63, 0.80], ['Epsilon CrB', '15 57 35.3', '+26 52 40', 4.15, 1.23],
  // Auriga
  ['Capella', '05 16 41.4', '+45 59 53', 0.08, 0.80], ['Menkalinan', '05 59 31.7', '+44 56 51', 1.90, 0.08],
  ['Mahasim', '05 59 43.3', '+37 12 45', 2.62, -0.08], ['Hassaleh', '04 56 59.6', '+33 09 58', 2.69, 1.53],
  ['Almaaz', '05 01 58.1', '+43 49 24', 2.99, 0.54],
  // Pegasus & Andromeda
  ['Alpheratz', '00 08 23.3', '+29 05 26', 2.06, -0.11], ['Scheat', '23 03 46.5', '+28 04 58', 2.42, 1.67],
  ['Markab', '23 04 45.7', '+15 12 19', 2.48, -0.04], ['Algenib', '00 13 14.2', '+15 11 01', 2.83, -0.23],
  ['Enif', '21 44 11.2', '+09 52 30', 2.39, 1.52], ['Homam', '22 41 27.7', '+10 49 53', 3.40, -0.09],
  ['Biham', '22 10 12.0', '+06 11 52', 3.53, 0.09], ['Matar', '22 43 00.1', '+30 13 17', 2.94, 0.86],
  ['Delta And', '00 39 19.7', '+30 51 40', 3.27, 1.28], ['Mirach', '01 09 43.9', '+35 37 14', 2.05, 1.58],
  ['Almach', '02 03 54.0', '+42 19 47', 2.10, 1.37],
  // Perseus
  ['Mirfak', '03 24 19.4', '+49 51 40', 1.79, 0.48], ['Algol', '03 08 10.1', '+40 57 20', 2.12, -0.05],
  ['Delta Per', '03 42 55.5', '+47 47 15', 3.01, -0.13], ['Epsilon Per', '03 57 51.2', '+40 00 37', 2.89, -0.18],
  ['Zeta Per', '03 54 07.9', '+31 53 01', 2.85, 0.27], ['Gamma Per', '03 04 47.8', '+53 30 23', 2.93, 0.70],
  ['Eta Per', '02 50 41.8', '+55 53 44', 3.76, 1.68],
  // Virgo
  ['Spica', '13 25 11.6', '-11 09 41', 0.97, -0.23], ['Porrima', '12 41 39.6', '-01 26 58', 2.74, 0.36],
  ['Vindemiatrix', '13 02 10.6', '+10 57 33', 2.83, 0.94], ['Minelauva', '12 55 36.2', '+03 23 51', 3.38, 1.58],
  ['Zavijava', '11 50 41.7', '+01 45 53', 3.61, 0.55], ['Heze', '13 34 41.6', '-00 35 45', 3.37, 0.11],
  ['Zaniah', '12 19 54.4', '-00 40 00', 3.89, 0.02],
  // Corvus
  ['Gienah', '12 15 48.4', '-17 32 31', 2.59, -0.11], ['Algorab', '12 29 51.9', '-16 30 56', 2.94, -0.05],
  ['Kraz', '12 34 23.2', '-23 23 48', 2.65, 0.89], ['Minkar', '12 10 07.5', '-22 37 11', 3.00, 1.33],
  // Triangulum Australe
  ['Atria', '16 48 39.9', '-69 01 40', 1.91, 1.44], ['Beta TrA', '15 55 08.6', '-63 25 50', 2.85, 0.29],
  ['Gamma TrA', '15 18 54.6', '-68 40 46', 2.89, 0.00],
  // Draco (head)
  ['Eltanin', '17 56 36.4', '+51 29 20', 2.24, 1.52], ['Rastaban', '17 30 26.0', '+52 18 05', 2.79, 0.98],
  ['Thuban', '14 04 23.3', '+64 22 33', 3.65, -0.05],
  // Bright stars without drawn figures
  ['Canopus', '06 23 57.1', '-52 41 44', -0.74, 0.15], ['Achernar', '01 37 42.8', '-57 14 12', 0.46, -0.16],
  ['Fomalhaut', '22 57 39.0', '-29 37 20', 1.16, 0.09], ['Miaplacidus', '09 13 12.0', '-69 43 02', 1.67, 0.07],
  ['Avior', '08 22 30.8', '-59 30 34', 1.86, 1.28], ['Aspidiske', '09 17 05.4', '-59 16 31', 2.21, 0.18],
  ['Alphard', '09 27 35.2', '-08 39 31', 1.98, 1.44], ['Hamal', '02 07 10.4', '+23 27 45', 2.00, 1.15],
  ['Diphda', '00 43 35.4', '-17 59 12', 2.02, 1.02], ['Rasalhague', '17 34 56.1', '+12 33 36', 2.07, 0.16],
  ['Alnair', '22 08 14.0', '-46 57 40', 1.73, -0.13], ['Peacock', '20 25 38.9', '-56 44 06', 1.94, -0.12],
  ['Tiaki', '22 42 40.1', '-46 53 05', 2.07, 1.60], ['Alderamin', '21 18 34.8', '+62 35 08', 2.45, 0.26],
  ['Menkar', '03 02 16.8', '+04 05 23', 2.54, 1.64], ['Suhail', '09 07 59.8', '-43 25 57', 2.21, 1.66],
  ['Regor', '08 09 31.9', '-47 20 12', 1.83, -0.22], ['Naos', '08 03 35.0', '-40 00 12', 2.25, -0.27],
  ['Delta Vel', '08 44 42.2', '-54 42 30', 1.96, 0.04], ['Markeb', '09 22 06.8', '-55 00 38', 2.47, -0.14],
  ['Ankaa', '00 26 17.0', '-42 18 22', 2.37, 1.09], ['Unukalhai', '15 44 16.1', '+06 25 32', 2.63, 1.17],
  ['Sabik', '17 10 22.7', '-15 43 29', 2.43, 0.06], ['Kornephoros', '16 30 13.2', '+21 29 23', 2.77, 0.95],
  ['Zubeneschamali', '15 17 00.4', '-09 22 59', 2.61, -0.07], ['Zubenelgenubi', '14 50 52.7', '-16 02 30', 2.75, 0.15],
  ['Deneb Algedi', '21 47 02.4', '-16 07 38', 2.85, 0.18], ['Sadalsuud', '21 31 33.5', '-05 34 16', 2.87, 0.83],
  ['Sadalmelik', '22 05 47.0', '-00 19 11', 2.94, 0.98],
];

function hms(s) {
  const [h, m, sec] = s.trim().split(/\s+/).map(Number);
  return (h + m / 60 + sec / 3600) * 15;
}
function dms(s) {
  const sign = s.trim().startsWith('-') ? -1 : 1;
  const [d, m, sec] = s.replace(/[+-]/, '').trim().split(/\s+/).map(Number);
  return sign * (d + m / 60 + sec / 3600);
}

export const STARS = RAW.map(([name, ra, dec, mag, bv]) => ({ name, ra: hms(ra), dec: dms(dec), mag, bv }));
export const STAR_BY_NAME = Object.fromEntries(STARS.map((s) => [s.name, s]));

// Each figure is a list of polylines through named stars.
export const CONSTELLATIONS = [
  { name: 'Orion', lines: [['Meissa', 'Betelgeuse', 'Alnitak', 'Alnilam', 'Mintaka', 'Bellatrix', 'Meissa'], ['Betelgeuse', 'Bellatrix'], ['Alnitak', 'Saiph'], ['Mintaka', 'Rigel']] },
  { name: 'Ursa Major', lines: [['Alkaid', 'Mizar', 'Alioth', 'Megrez', 'Phecda', 'Merak', 'Dubhe', 'Megrez']] },
  { name: 'Ursa Minor', lines: [['Polaris', 'Yildun', 'Epsilon UMi', 'Zeta UMi', 'Kochab', 'Pherkad', 'Eta UMi', 'Zeta UMi']] },
  { name: 'Cassiopeia', lines: [['Caph', 'Schedar', 'Navi', 'Ruchbah', 'Segin']] },
  { name: 'Cygnus', lines: [['Deneb', 'Sadr', 'Albireo'], ['Fawaris', 'Sadr', 'Aljanah']] },
  { name: 'Lyra', lines: [['Vega', 'Zeta Lyr', 'Sheliak', 'Sulafat', 'Delta Lyr', 'Zeta Lyr']] },
  { name: 'Aquila', lines: [['Okab', 'Tarazed', 'Altair', 'Alshain', 'Theta Aql'], ['Altair', 'Delta Aql', 'Lambda Aql']] },
  { name: 'Scorpius', lines: [['Acrab', 'Dschubba', 'Fang'], ['Dschubba', 'Alniyat', 'Antares', 'Paikauhale', 'Larawag', 'Mu1 Sco', 'Zeta2 Sco', 'Eta Sco', 'Sargas', 'Iota1 Sco', 'Girtab', 'Shaula', 'Lesath']] },
  { name: 'Sagittarius', lines: [['Alnasl', 'Kaus Media', 'Kaus Australis', 'Alnasl'], ['Kaus Media', 'Kaus Borealis', 'Phi Sgr', 'Kaus Media'], ['Phi Sgr', 'Nunki', 'Tau Sgr', 'Ascella', 'Phi Sgr'], ['Ascella', 'Kaus Australis']] },
  { name: 'Crux', lines: [['Acrux', 'Gacrux'], ['Mimosa', 'Imai']] },
  { name: 'Centaurus', lines: [['Rigil Kentaurus', 'Hadar', 'Epsilon Cen', 'Zeta Cen', 'Eta Cen'], ['Zeta Cen', 'Menkent'], ['Epsilon Cen', 'Muhlifain', 'Delta Cen']] },
  { name: 'Canis Major', lines: [['Mirzam', 'Sirius', 'Omicron2 CMa', 'Wezen', 'Adhara', 'Furud'], ['Wezen', 'Aludra']] },
  { name: 'Canis Minor', lines: [['Procyon', 'Gomeisa']] },
  { name: 'Gemini', lines: [['Castor', 'Pollux'], ['Castor', 'Mebsuta', 'Tejat', 'Propus'], ['Pollux', 'Wasat', 'Mekbuda', 'Alhena'], ['Wasat', 'Alzirr'], ['Pollux', 'Kappa Gem']] },
  { name: 'Taurus', lines: [['Elnath', 'Ain', 'Delta1 Tau', 'Prima Hyadum', 'Aldebaran', 'Tianguan'], ['Prima Hyadum', 'Lambda Tau']] },
  { name: 'Leo', lines: [['Regulus', 'Eta Leo', 'Algieba', 'Adhafera', 'Rasalas', 'Algenubi'], ['Algieba', 'Zosma', 'Denebola', 'Chertan', 'Regulus'], ['Zosma', 'Chertan']] },
  { name: 'Boötes', lines: [['Arcturus', 'Izar', 'Delta Boo', 'Nekkar', 'Seginus', 'Rho Boo', 'Arcturus', 'Muphrid']] },
  { name: 'Corona Borealis', lines: [['Theta CrB', 'Nusakan', 'Alphecca', 'Gamma CrB', 'Delta CrB', 'Epsilon CrB']] },
  { name: 'Auriga', lines: [['Capella', 'Menkalinan', 'Mahasim', 'Elnath', 'Hassaleh', 'Almaaz', 'Capella']] },
  { name: 'Pegasus', lines: [['Alpheratz', 'Scheat', 'Markab', 'Algenib', 'Alpheratz'], ['Markab', 'Homam', 'Biham', 'Enif'], ['Scheat', 'Matar']] },
  { name: 'Andromeda', lines: [['Alpheratz', 'Delta And', 'Mirach', 'Almach']] },
  { name: 'Perseus', lines: [['Eta Per', 'Gamma Per', 'Mirfak', 'Delta Per', 'Epsilon Per', 'Zeta Per'], ['Mirfak', 'Algol']] },
  { name: 'Virgo', lines: [['Zavijava', 'Zaniah', 'Porrima', 'Minelauva', 'Vindemiatrix'], ['Porrima', 'Spica'], ['Minelauva', 'Heze', 'Spica']] },
  { name: 'Corvus', lines: [['Gienah', 'Algorab', 'Kraz', 'Minkar', 'Gienah']] },
  { name: 'Triangulum Australe', lines: [['Atria', 'Beta TrA', 'Gamma TrA', 'Atria']] },
];

// Stars labelled when "Star names" is on.
export const NAMED_STARS = ['Sirius', 'Canopus', 'Rigil Kentaurus', 'Arcturus', 'Vega', 'Capella', 'Rigel', 'Procyon',
  'Achernar', 'Betelgeuse', 'Hadar', 'Altair', 'Acrux', 'Aldebaran', 'Antares', 'Spica', 'Pollux', 'Fomalhaut',
  'Deneb', 'Regulus', 'Castor', 'Polaris', 'Bellatrix', 'Alnilam', 'Shaula', 'Dubhe', 'Alkaid', 'Mirfak', 'Algol', 'Alpheratz'];
