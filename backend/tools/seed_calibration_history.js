/**
 * seed_calibration_history.js
 * ----------------------------
 * One-time import: inserts historical calibration records from the
 * CSV export into CalibrationHistory, matched against tools that
 * actually exist in CalibrationEquipment OR InHouseCalibrationEquipment.
 *
 * Rules:
 *   - result normalised: "Paass" / "Use correction" → "Pass"
 *   - "Not Pass" stays "Not Pass"
 *   - error_percent = NULL (user fills later)
 *   - measured_value = NULL
 *   - file = NULL
 *   - cal_status = NULL (no criteria to compute against without error%)
 *   - Duplicate guard: skip if (equipment_row_id, performed_date, source) already exists
 *
 * Run from IATF/backend directory:
 *   node tools/seed_calibration_history.js
 */

const path    = require('path');
const sqlite3 = require('sqlite3').verbose();

// ── DB path (same multi-try logic as the rest of the backend) ──────────────
const DB_CANDIDATES = [
  path.resolve(__dirname, '..', 'db', 'nskiatf_doccontrol.db'),
  path.resolve(process.cwd(), 'db', 'nskiatf_doccontrol.db'),
];
const DB_PATH = DB_CANDIDATES.find(p => {
  try { require('fs').accessSync(p); return true; } catch { return false; }
}) || DB_CANDIDATES[0];

// ── CSV data (instrument_no = equipment_id to match against DB) ───────────
// Columns: instrument_no, cal_date, cal_result, remark
// Rows with duplicate instrument_no+cal_date are skipped (already covered).
const RAW_ROWS = [
  ["INV-BA-01","2016-03-03","Pass",""],
  ["INV-BA-01","2017-02-14","Pass",""],
  ["INV-BA-01","2018-03-08","Pass","Change from Burapa to CLC"],
  ["INV-BA-01","2019-03-25","Pass",""],
  ["INV-BA-01","2020-03-24","Pass",""],
  ["INV-BA-01","2021-04-01","Pass","Late due to renovate measuring room"],
  ["INV-BA-02","2016-03-03","Pass",""],
  ["INV-BA-02","2017-02-14","Pass",""],
  ["INV-BA-02","2018-03-08","Pass","Change from Burapa to CLC"],
  ["INV-BA-02","2019-03-25","Pass",""],
  ["INV-BA-02","2020-03-24","Pass",""],
  ["INV-BA-02","2021-04-01","Pass","Late due to renovate measuring room"],
  ["INV-BA-02","2022-03-21","Pass",""],
  ["INV-BA-02","2023-03-17","Pass",""],
  ["INV-BA-02","2024-03-15","Pass","Change from CLC to THC"],
  ["INV-BA-02","2025-03-14","Pass",""],
  ["TES-AU-01","2016-02-17","Pass",""],
  ["TES-AU-01","2017-03-16","Pass",""],
  ["TES-AU-01","2018-03-20","Pass",""],
  ["TES-AU-01","2019-03-14","Pass",""],
  ["TES-AU-01","2020-02-24","Pass",""],
  ["TES-AU-01","2021-03-11","Pass","Late due to COVID-19"],
  ["TES-AU-01","2022-03-07","Pass",""],
  ["INV-BG-01","2016-02-12","Pass",""],
  ["INV-BG-01","2017-02-10","Pass","Change from TPA to CLC"],
  ["INV-BG-01","2018-01-29","Pass",""],
  ["INV-BG-01","2019-01-29","Pass",""],
  ["INV-BG-01","2020-01-23","Pass",""],
  ["INV-BG-01","2021-01-30","Pass",""],
  ["INV-BG-01","2022-01-31","Pass",""],
  ["INV-BG-01","2023-01-26","Pass",""],
  ["INV-BG-01","2024-01-26","Pass",""],
  ["INV-BG-01","2025-01-24","Pass","Change from CLC to THC"],
  ["INV-BG-01","2026-01-24","Pass",""],
  ["INV-BG-02","2015-02-21","Pass",""],
  ["INV-BG-02","2018-01-29","Pass","Change from TPA to CLC"],
  ["INV-BG-02","2019-01-29","Pass",""],
  ["INV-BG-02","2020-01-23","Pass",""],
  ["INV-BG-02","2021-01-30","Pass",""],
  ["INV-BG-02","2022-01-31","Pass",""],
  ["INV-BG-02","2023-01-26","Pass",""],
  ["INV-BG-02","2024-01-26","Pass",""],
  ["INV-BG-02","2025-01-24","Pass","Change from CLC to THC"],
  ["INV-BG-02","2026-01-24","Pass",""],
  ["INV-BG-03","2016-02-12","Pass",""],
  ["INV-BG-03","2017-02-10","Pass","Change from TPA to CLC"],
  ["INV-BG-03","2018-02-02","Pass",""],
  ["INV-BG-03","2019-02-20","Pass",""],
  ["INV-BG-03","2019-02-21","Pass",""],
  ["INV-BG-03","2021-02-24","Pass",""],
  ["INV-BG-03","2022-02-25","Pass",""],
  ["INV-BG-03","2023-03-17","Pass","Late due to supplier mis-communicate."],
  ["INV-BG-03","2024-03-15","Pass","Change from CLC to THC"],
  ["INV-BG-03","2025-03-11","Pass",""],
  ["INV-BG-04","2016-02-12","Pass",""],
  ["INV-BG-04","2017-02-10","Pass","Change from TPA to CLC"],
  ["INV-BG-04","2018-02-02","Pass",""],
  ["INV-BG-04","2019-02-20","Pass",""],
  ["INV-BG-04","2020-02-21","Pass",""],
  ["INV-BG-04","2021-02-24","Pass",""],
  ["INV-BG-04","2022-02-25","Pass",""],
  ["INV-BG-04","2023-03-17","Pass","Late due to supplier mis-communicate."],
  ["INV-BG-04","2024-03-15","Pass","Change from CLC to THC"],
  ["INV-BG-04","2025-03-11","Pass",""],
  ["INV-BG-05","2016-02-12","Pass",""],
  ["INV-BG-05","2017-02-10","Pass","Change from TPA to CLC"],
  ["INV-BG-05","2018-02-02","Pass",""],
  ["INV-BG-05","2019-02-20","Pass",""],
  ["INV-BG-05","2020-02-21","Pass",""],
  ["INV-BG-05","2021-02-24","Pass",""],
  ["INV-BG-05","2022-02-25","Pass",""],
  ["INV-BG-05","2023-03-17","Pass","Late due to supplier mis-communicate."],
  ["INV-BG-05","2024-03-15","Pass","Change from TCLC to THC"],
  ["INV-BG-05","2025-03-11","Pass",""],
  ["INV-DG-01","2016-02-24","Pass",""],
  ["INV-DG-01","2018-05-10","Pass","Change from TPA to CLC"],
  ["INV-DG-01","2019-04-19","Pass",""],
  ["INV-DG-01","2020-04-25","Pass",""],
  ["INV-DG-01","2021-12-23","Pass","Late due to COVID-19"],
  ["INV-DG-01","2022-12-26","Pass","Change from CLC to NA"],
  ["INV-DG-01","2023-12-26","Pass","Change from NA to CLC"],
  ["INV-DG-01","2024-12-23","Pass","Change from CLC to THC"],
  ["INV-DG-01","2025-12-23","Pass",""],
  ["INV-DG-02","2018-03-29","Pass",""],
  ["INV-DG-02","2019-04-19","Pass",""],
  ["INV-DG-02","2020-04-25","Pass",""],
  ["INV-DG-02","2021-12-23","Pass","Late due to COVID-19"],
  ["INV-DG-02","2022-12-26","Pass","Change from CLC to NA"],
  ["INV-DG-02","2023-12-26","Pass","Change from NA to CLC"],
  ["INV-DG-02","2024-12-23","Pass","Change from CLC to THC"],
  ["INV-DG-02","2025-12-23","Pass",""],
  ["INV-DG-03","2018-03-29","Pass",""],
  ["INV-DG-03","2019-04-19","Pass",""],
  ["INV-DG-04","2016-02-24","Pass",""],
  ["INV-DG-04","2018-02-10","Pass","Change from TPA to CLC"],
  ["INV-DG-04","2018-03-02","Pass",""],
  ["INV-DG-04","2019-04-19","Pass",""],
  ["INV-DG-04","2020-04-25","Pass",""],
  ["INV-DG-04","2021-12-23","Pass","Late due to COVID-19"],
  ["INV-DG-04","2022-12-26","Pass","Change from CLC to NA"],
  ["INV-DG-04","2023-12-26","Pass","Change from NA to CLC"],
  ["INV-DG-04","2024-12-23","Pass","Change from CLC to THC"],
  ["INV-DG-04","2025-12-23","Pass",""],
  ["INV-DG-05","2015-02-21","Pass",""],
  ["INV-DG-05","2017-01-11","Pass","Change from TPA to CLC"],
  ["INV-DG-05","2018-04-05","Pass",""],
  ["INV-DG-05","2019-04-15","Pass",""],
  ["INV-DG-05","2020-04-25","Pass",""],
  ["INV-DG-05","2021-06-23","Pass","Late due to COVID-19"],
  ["INV-DG-05","2022-06-22","Pass",""],
  ["INV-DG-05","2023-06-21","Pass",""],
  ["INV-DG-05","2024-06-21","Not Pass","Change from CLC to THC"],
  ["INV-DD-01","2016-02-08","Pass",""],
  ["INV-DD-01","2017-02-10","Pass",""],
  ["INV-DD-01","2018-03-02","Pass",""],
  ["INV-DD-01","2019-02-20","Pass",""],
  ["INV-DD-01","2020-02-21","Pass",""],
  ["INV-DD-01","2021-02-24","Pass",""],
  ["INV-DD-01","2022-02-25","Pass",""],
  ["INV-DD-01","2023-03-17","Pass","Late due to supplier mis-communicate."],
  ["INV-DD-01","2024-03-15","Pass","Change from CLC to THC"],
  ["INV-DD-01","2025-03-11","Pass",""],
  ["TES-LC-01","2018-03-20","Pass",""],
  ["TES-LC-01","2021-03-26","Pass",""],
  ["TES-LC-01","2024-04-12","Pass",""],
  ["TES-LC-02","2018-03-20","Pass",""],
  ["TES-LC-03","2018-08-25","Pass",""],
  ["TES-LC-03","2021-12-23","Pass","Late due to COVID-19, Change to 2 yearly calibration"],
  ["TES-LC-03","2023-12-21","Pass",""],
  ["TES-LC-03","2025-12-23","Pass",""],
  ["INV-DM-01","2015-02-21","Pass",""],
  ["INV-DM-01","2017-01-11","Pass",""],
  ["INV-DM-01","2018-01-29","Pass","Change from TPA to CLC"],
  ["INV-DM-01","2019-01-29","Pass",""],
  ["INV-DM-01","2020-01-23","Pass",""],
  ["INV-DM-01","2021-01-30","Pass",""],
  ["INV-DM-01","2022-01-31","Pass",""],
  ["INV-DM-01","2023-01-26","Pass",""],
  ["INV-DM-01","2024-01-26","Pass",""],
  ["INV-DM-01","2025-01-24","Pass","Change from CLC to THC"],
  ["INV-DM-01","2026-01-24","Pass",""],
  ["INV-DM-02","2015-02-21","Pass",""],
  ["INV-DM-02","2018-01-29","Pass","Change from TPA to CLC"],
  ["INV-DM-02","2019-01-29","Pass",""],
  ["INV-DM-02","2020-01-23","Pass",""],
  ["INV-DM-02","2021-01-30","Pass",""],
  ["INV-DM-02","2022-01-31","Pass",""],
  ["INV-DM-02","2023-01-26","Pass",""],
  ["INV-DM-02","2024-01-26","Pass",""],
  ["INV-DM-02","2025-01-24","Pass","Change from CLC to THC"],
  ["INV-DM-02","2026-01-24","Pass",""],
  ["INV-DM-03","2016-02-19","Pass",""],
  ["INV-DM-03","2017-02-10","Pass","Change from TPA to CLC"],
  ["INV-DM-03","2018-02-02","Pass",""],
  ["INV-DM-03","2019-03-14","Pass","Late under used"],
  ["INV-DM-03","2020-03-14","Pass",""],
  ["INV-DM-03","2021-03-22","Pass",""],
  ["INV-DM-03","2022-03-25","Pass",""],
  ["INV-DM-03","2023-03-11","Pass",""],
  ["INV-DM-03","2024-03-11","Pass","Change from CLC to THC"],
  ["INV-DM-03","2025-03-11","Pass",""],
  ["INV-DM-04","2016-02-19","Pass",""],
  ["INV-DM-04","2017-02-10","Pass","Change from TPA to CLC"],
  ["INV-DM-04","2018-02-02","Pass",""],
  ["INV-DM-04","2019-03-14","Pass","Late under used"],
  ["INV-DM-04","2020-03-14","Pass",""],
  ["INV-DM-04","2021-03-22","Pass",""],
  ["INV-DM-04","2022-03-25","Pass",""],
  ["INV-DM-04","2023-03-11","Pass",""],
  ["INV-DM-04","2024-03-11","Pass","Change from CLC to THC"],
  ["INV-DM-04","2025-03-11","Pass",""],
  ["INV-GB-01","2004-08-06","Pass",""],
  ["INV-GB-01","2017-02-15","Pass","Change from Mitutoyo to CLC"],
  ["INV-GB-01","2022-02-25","Pass",""],
  ["INV-GB-02","2018-03-20","Pass",""],
  ["INV-GB-02","2023-03-13","Pass",""],
  ["INV-MM-01","2015-08-04","Pass",""],
  ["INV-MM-01","2016-08-04","Pass",""],
  ["INV-MM-01","2017-08-07","Pass",""],
  ["INV-MM-01","2018-08-03","Pass",""],
  ["INV-MM-01","2019-08-02","Pass","Change from yearly to 3 yearly"],
  ["INV-RT-01","2015-08-04","Pass",""],
  ["INV-RT-01","2016-08-04","Pass",""],
  ["INV-RT-01","2017-08-07","Pass",""],
  ["INV-RT-01","2018-08-03","Pass",""],
  ["INV-RT-01","2019-08-02","Pass",""],
  ["INV-RT-01","2020-08-06","Pass",""],
  ["INV-RT-01","2021-10-08","Pass","Late due to COVID-19"],
  ["INV-RT-01","2022-10-05","Pass",""],
  ["INV-RT-01","2023-10-05","Pass",""],
  ["INV-RT-01","2024-10-11","Pass","Late due to Safety trainning"],
  ["INV-RT-01","2025-10-10","Pass",""],
  ["INV-HM-01","2018-05-11","Pass",""],
  ["INV-HM-01","2023-04-27","Pass",""],
  ["INV-HM-02","2018-05-11","Pass",""],
  ["INV-HM-02","2023-04-27","Pass",""],
  ["INV-HM-03","2018-05-18","Pass",""],
  ["INV-HM-03","2023-04-27","Pass",""],
  ["TES-PI-01","2015-02-18","Pass",""],
  ["TES-PI-01","2017-02-24","Pass","Change from TPA to CLC"],
  ["TES-PI-01","2019-03-14","Pass","Late under used"],
  ["TES-PI-01","2021-03-23","Pass",""],
  ["TES-PI-01","2023-03-13","Pass",""],
  ["TES-PI-01","2025-03-11","Pass",""],
  ["INV-SC-01","2017-03-15","Pass",""],
  ["INV-SC-01","2022-12-26","Pass","Late due to contact supplier"],
  ["INV-OS-01","2012-08-07","Pass",""],
  ["INV-OS-01","2017-03-17","Pass",""],
  ["TES-TA-01","2015-02-19","Pass",""],
  ["TES-TA-01","2017-02-24","Pass","Change from TPA to CLC"],
  ["TES-TA-01","2019-03-14","Pass",""],
  ["TES-TA-01","2021-03-22","Pass",""],
  ["TES-TA-01","2023-03-11","Pass",""],
  ["TES-TA-01","2025-03-11","Pass",""],
  ["TES-HM-01","2015-02-26","Pass",""],
  ["TES-HM-01","2020-06-10","Pass","Late due to COVID'19"],
  ["TES-OV-01","2015-02-26","Pass",""],
  ["TES-OV-01","2020-06-10","Pass","Late due to COVID'19"],
  ["TES-OV-01","2025-06-09","Pass",""],
  ["TES-DW-01","2015-07-06","Pass",""],
  ["TES-DW-01","2018-02-08","Pass",""],
  ["TES-DW-01","2023-03-18","Pass","Late due to supplier mis-communicate."],
  ["INV-MU-01","2015-01-17","Pass",""],
  ["INV-MU-01","2018-01-29","Pass","Change from Systronics to CLC"],
  ["INV-MU-01","2021-01-30","Pass",""],
  ["INV-MU-01","2024-01-30","Pass",""],
  ["TES-TM-01","2015-01-20","Pass",""],
  ["TES-TM-01","2018-01-29","Pass","Change from Systronics to CLC"],
  ["TES-TM-01","2021-01-30","Pass",""],
  ["TES-TM-01","2024-01-30","Pass",""],
  ["INV-DC-01","2018-03-19","Pass",""],
  ["INV-DC-01","2022-07-04","Pass",""],
  ["INV-DC-01","2023-03-11","Pass",""],
  ["TES-TW-01","2015-02-18","Pass",""],
  ["TES-TW-01","2017-02-15","Pass","Change from TPA to CLC"],
  ["TES-TW-01","2019-03-15","Pass","Late under used"],
  ["TES-TW-01","2021-06-23","Pass","Late under used"],
  ["TES-TW-01","2023-06-23","Pass",""],
  ["TES-TW-01","2025-06-20","Pass",""],
  ["TES-TW-02","2015-02-18","Pass",""],
  ["TES-TW-02","2017-02-15","Pass","Change from TPA to CLC"],
  ["TES-TW-02","2019-04-19","Pass","Late under used"],
  ["TES-TW-02","2021-12-23","Pass","Late under used"],
  ["TES-TW-03","2017-01-10","Pass",""],
  ["TES-TW-03","2019-04-19","Pass","Change from TPA to CLC, Late under used"],
  ["TES-TW-03","2020-11-02","Pass",""],
  ["TES-TW-03","2022-12-27","Pass","Change from CLC to NA, Late under used"],
  ["TES-TW-03","2024-12-23","Pass","Change from NA to THC"],
  ["INV-PP-01","2015-02-19","Pass",""],
  ["INV-PP-01","2017-02-15","Pass","Change from TPA to CLC"],
  ["INV-PP-01","2019-03-15","Pass","Late under used"],
  ["INV-PP-01","2021-06-23","Pass","Late due to COVID'19"],
  ["INV-PP-01","2023-06-21","Pass",""],
  ["INV-PP-01","2025-06-20","Pass",""],
  ["INV-PP-02","2015-02-19","Pass",""],
  ["INV-PP-02","2017-01-04","Pass",""],
  ["INV-PP-02","2019-01-29","Pass","Change from TPA to CLC"],
  ["INV-PP-02","2021-01-30","Pass",""],
  ["INV-PP-02","2023-01-26","Pass",""],
  ["INV-PP-02","2025-01-24","Pass","Change from CLC to THC"],
  ["INV-PP-03","2013-09-18","Pass",""],
  ["INV-PP-03","2017-01-04","Pass",""],
  ["INV-PP-03","2019-01-29","Pass","Change from TPA to CLC"],
  ["INV-PP-03","2021-01-30","Pass",""],
  ["INV-PP-03","2023-01-26","Pass",""],
  ["INV-PP-03","2025-01-24","Pass","Change from CLC to THC"],
  ["INV-ST-01","2015-02-20","Pass",""],
  ["INV-ST-01","2020-03-14","Pass","Change from TPA to CLC"],
  ["INV-ST-01","2025-03-11","Pass","Change from CLC to THC"],
  ["INV-RG-03","2018-03-19","Pass",""],
  ["INV-RG-03","2023-03-11","Pass",""],
  ["INV-RG-04","2018-03-19","Pass",""],
  ["INV-RG-04","2023-03-11","Pass",""],
  ["INV-RG-05","2018-03-19","Pass",""],
  ["INV-RG-05","2023-03-11","Pass",""],
  ["TES-SO-01","2018-04-05","Pass","Not used"],
  ["TES-BB-01","2018-06-15","Pass",""],
  ["TES-BB-01","2021-12-23","Pass","Late due to COVID'19"],
  ["TES-BB-01","2024-12-23","Pass","Change from CLC to THC"],
  ["INV-DC-02","2019-01-29","Pass",""],
  ["INV-DC-02","2024-01-30","Pass",""],
  ["INV-HR-01","2015-06-11","Pass",""],
  ["INV-HR-01","2016-08-04","Pass",""],
  ["INV-HR-01","2017-08-04","Pass",""],
  ["INV-HR-01","2018-08-03","Pass",""],
  ["INV-HR-01","2019-08-06","Pass","Change from Mitutoyo to MMT"],
  ["INV-HR-01","2020-08-07","Pass",""],
  ["INV-HR-01","2021-10-08","Pass","Late due to COVID'19"],
  ["INV-HR-01","2022-10-06","Pass",""],
  ["INV-HR-01","2023-10-05","Pass",""],
  ["INV-HR-01","2024-10-11","Pass","Late due to Safety trainning"],
  ["INV-HR-01","2025-10-10","Pass",""],
  ["INV-HV-01","2015-08-04","Pass",""],
  ["INV-HV-01","2016-08-04","Pass",""],
  ["INV-HV-01","2017-08-07","Pass",""],
  ["INV-HV-01","2018-08-03","Pass",""],
  ["INV-HV-01","2019-08-06","Pass","Change from Mitutoyo to MMT"],
  ["INV-HV-01","2020-08-07","Pass",""],
  ["INV-HV-01","2021-10-08","Pass","Late due to COVID'19"],
  ["INV-HV-01","2022-10-06","Pass",""],
  ["INV-HV-01","2023-10-05","Pass",""],
  ["INV-HV-01","2024-10-11","Pass","Late due to Safety trainning"],
  ["INV-HV-01","2025-10-10","Pass",""],
  ["INV-RT-02","2021-03-19","Pass","New instrument"],
  ["INV-RT-02","2022-07-15","Pass","Late due to supplier contact"],
  ["INV-RT-02","2023-07-12","Pass",""],
  ["INV-RT-02","2024-07-09","Pass",""],
  ["INV-RT-02","2025-07-09","Pass",""],
  ["INV-DG-06","2021-06-23","Pass","New instrument"],
  ["INV-DG-06","2022-06-22","Pass",""],
  ["INV-DG-06","2023-06-21","Pass",""],
  ["INV-DG-06","2024-06-21","Pass","Change from CLC to THC"],
  ["INV-DG-06","2025-06-20","Pass",""],
  ["INV-BG-06","2021-06-23","Pass","New instrument"],
  ["INV-BG-06","2022-06-22","Pass",""],
  ["INV-BG-06","2023-06-21","Pass",""],
  ["INV-BG-06","2024-06-21","Pass","Change from CLC to THC"],
  ["INV-BG-06","2025-06-20","Pass",""],
  ["INV-BG-07","2021-06-23","Pass","New instrument"],
  ["INV-BG-07","2022-06-22","Pass",""],
  ["INV-BG-07","2023-06-21","Pass",""],
  ["INV-BG-07","2024-06-21","Pass","Change from CLC to THC"],
  ["INV-BG-07","2025-06-20","Pass",""],
  ["INV-BG-08","2021-06-23","Pass","New instrument"],
  ["INV-BG-08","2022-06-22","Pass",""],
  ["INV-BG-08","2023-06-21","Pass",""],
  ["INV-BG-08","2024-06-21","Pass","Change from CLC to THC"],
  ["INV-BG-08","2025-06-20","Pass",""],
  ["INV-DD-02","2021-10-04","Pass","New instrument"],
  ["INV-DD-02","2022-12-26","Pass",""],
  ["INV-DD-02","2023-12-26","Pass",""],
  ["INV-DD-02","2024-12-23","Pass","Change from CLC to THC"],
  ["INV-DD-02","2025-12-23","Pass",""],
  ["INV-FG-01","2021-07-15","Pass","New instrument"],
  ["INV-FG-01","2023-07-14","Pass",""],
  ["INV-FG-01","2025-07-12","Pass","Change from CLC to THC"],
  ["INV-DI-01","2021-06-23","Pass","New instrument"],
  ["INV-DI-01","2023-06-21","Pass",""],
  ["INV-DI-01","2025-06-20","Pass",""],
  ["INV-RG-06","2021-12-23","Pass","New instrument"],
  ["INV-RG-07","2021-12-23","Pass","New instrument"],
  ["INV-RG-08","2021-12-23","Pass","New instrument"],
  ["INV-RG-09","2021-12-23","Pass","New instrument"],
  ["INV-RG-10","2021-12-23","Pass","New instrument"],
  ["TES-TS-01","2022-01-04","Pass",""],
  ["TES-TS-01","2022-12-27","Pass",""],
  ["TES-TS-01","2023-12-27","Pass",""],
  ["TES-TS-01","2024-12-23","Pass","Change from NA to THC"],
  ["TES-TS-01","2025-12-23","Pass",""],
  ["INV-BA-03","2022-03-21","Pass","New instrument"],
  ["INV-BA-03","2023-03-17","Pass",""],
  ["INV-BA-03","2024-03-15","Pass","Change from CLC to THC"],
  ["INV-BA-03","2025-03-14","Pass",""],
  ["TES-TW-04","2022-04-28","Pass","New instrument"],
  ["TES-TW-04","2024-04-05","Pass",""],
  ["INV-TP-01","2023-01-12","Pass","New instrument"],
  ["INV-TP-01","2026-01-12","Pass","THC"],
  ["INV-TP-02","2023-01-12","Pass","New instrument"],
  ["INV-TP-02","2026-01-12","Pass","THC"],
  ["INV-TP-03","2023-01-12","Pass","New instrument"],
  ["INV-TP-03","2026-01-12","Pass","THC"],
  ["INV-TP-04","2023-01-12","Pass","New instrument"],
  ["INV-TP-04","2026-01-12","Pass","THC"],
  ["TES-TW-05","2023-01-26","Pass","New instrument"],
  ["TES-TW-05","2025-01-24","Pass","Change from CLC to THC"],
  ["TES-TW-06","2023-01-25","Pass","New instrument"],
  ["TES-TW-06","2025-01-24","Pass","Change from CLC to THC / 2yearly to 1yearly"],
  ["TES-AU-02","2023-03-23","Pass","New instrument"],
  ["TES-AU-02","2024-03-22","Pass",""],
  ["TES-AU-02","2025-03-20","Pass",""],
  ["INV-RG-11","2025-03-28","Pass",""],
  ["INV-RG-12","2025-03-28","Pass",""],
  ["INV-RG-13","2025-03-28","Pass",""],
  ["TES-LC-04","2023-12-25","Pass","New instrument"],
  ["TES-LC-04","2025-12-23","Pass","Change to THC"],
  ["TES-LC-05","2023-12-25","Pass","New instrument"],
  ["TES-LC-05","2025-12-23","Pass","Change to THC"],
  ["TES-PI-02","2024-05-13","Pass","New instrument"],
  ["INV-RG-14","2025-03-28","Pass",""],
  ["INV-RG-15","2025-03-28","Pass",""],
  ["INV-AN-01","2018-01-30","Pass",""],
  ["INV-AN-01","2019-01-26","Pass",""],
  ["INV-AN-01","2020-01-30","Pass",""],
  ["INV-AN-01","2021-01-29","Pass","Change from yearly to 2 yearly"],
  ["INV-AN-01","2023-01-30","Pass",""],
  ["INV-AN-01","2025-01-27","Pass",""],
  ["INV-SU-01","2013-11-12","Pass",""],
  ["INV-SU-01","2015-02-11","Pass",""],
  ["INV-SU-01","2017-02-21","Pass",""],
  ["INV-SU-01","2019-02-01","Pass",""],
  ["INV-SU-01","2021-02-05","Pass",""],
  ["INV-SU-01","2023-01-30","Pass",""],
  ["INV-SU-01","2025-01-27","Pass",""],
  ["INV-SC-02","2020-07-27","Pass",""],
  ["INV-SC-02","2022-07-08","Pass",""],
  ["INV-SC-02","2024-07-05","Pass",""],
  ["INV-TW-06","2022-07-04","Pass",""],
  ["INV-TW-07","2022-07-04","Pass",""],
  ["INV-TW-09","2022-07-04","Pass",""],
  ["INV-TW-10","2022-07-04","Pass",""],
  ["INV-TW-12","2022-07-04","Pass",""],
  ["INV-TW-13","2022-07-11","Pass",""],
  ["INV-PP-04","2022-07-29","Pass",""],
  ["INV-PP-05","2021-12-23","Pass",""],
  ["INV-RE-01","2022-07-11","Pass",""],
  ["TES-OX-01","2022-07-06","Pass",""],
  ["INV-AT-02","2022-07-06","Pass",""],
  ["INV-TD-01","2022-07-09","Pass",""],
  ["INV-TD-05","2022-07-09","Pass",""],
  ["INV-TD-07","2022-07-09","Pass",""],
  ["INV-TD-09","2022-07-09","Pass",""],
  ["INV-TD-11","2022-07-11","Pass",""],
  ["INV-TD-12","2022-07-04","Pass",""],
  ["TES-LC-07","2022-07-11","Pass",""],
  ["INV-TO-01","2022-07-29","Pass",""],
  ["INV-TO-05","2022-07-25","Pass",""],
];

// ── Normalise result ──────────────────────────────────────────────────────
function normaliseResult(raw) {
  const s = (raw || '').trim().toLowerCase();
  if (s === 'not pass') return 'Not Pass';
  return 'Pass'; // covers "Pass", "Paass", "Use correction", etc.
}

// ── Deduplicate input rows by (instrument_no, cal_date) ───────────────────
function dedupeRows(rows) {
  const seen = new Set();
  const out  = [];
  for (const r of rows) {
    const key = `${r[0]}|${r[1]}`;
    if (!seen.has(key)) { seen.add(key); out.push(r); }
  }
  return out;
}

// ── Main ──────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n📂  DB: ${DB_PATH}\n`);

  const db = new sqlite3.Database(DB_PATH);
  const run  = (sql, params=[]) => new Promise((res, rej) => db.run(sql, params, function(e){ e ? rej(e) : res(this); }));
  const all  = (sql, params=[]) => new Promise((res, rej) => db.all(sql, params, (e, rows) => e ? rej(e) : res(rows)));
  const get  = (sql, params=[]) => new Promise((res, rej) => db.get(sql, params, (e, row) => e ? rej(e) : res(row)));

  // Build equipment lookup: equipment_id → { id, source }
  // Prefer external first, then inhouse (in case same id exists in both)
  const extRows  = await all(`SELECT id, equipment_id FROM CalibrationEquipment`).catch(() => []);
  const inhRows  = await all(`SELECT id, equipment_id FROM InHouseCalibrationEquipment`).catch(() => []);

  const equipMap = new Map(); // equipment_id → [ { rowId, source }, ... ]
  for (const r of extRows)  {
    if (!equipMap.has(r.equipment_id)) equipMap.set(r.equipment_id, []);
    equipMap.get(r.equipment_id).push({ rowId: r.id, source: 'external' });
  }
  for (const r of inhRows)  {
    if (!equipMap.has(r.equipment_id)) equipMap.set(r.equipment_id, []);
    equipMap.get(r.equipment_id).push({ rowId: r.id, source: 'inhouse' });
  }

  console.log(`📊  Equipment in DB: ${extRows.length} external, ${inhRows.length} in-house`);

  // Ensure CalibrationHistory table has scheduled_date column (safe no-op if exists)
  await run(`ALTER TABLE CalibrationHistory ADD COLUMN scheduled_date TEXT`).catch(() => {});

  // Get existing history keys to skip duplicates
  const existing = await all(`SELECT source, equipment_row_id, performed_date FROM CalibrationHistory`);
  const existingKeys = new Set(existing.map(r => `${r.source}|${r.equipment_row_id}|${r.performed_date}`));
  console.log(`ℹ️   Existing history records: ${existingKeys.size}\n`);

  const inputRows = dedupeRows(RAW_ROWS);
  console.log(`📋  CSV rows (after dedup): ${inputRows.length}\n`);

  let inserted = 0;
  let skippedNotFound = 0;
  let skippedDuplicate = 0;
  const notFound = new Set();

  for (const [instrumentNo, calDate, calResult, remark] of inputRows) {
    const id = instrumentNo.trim();
    const entries = equipMap.get(id);

    if (!entries || entries.length === 0) {
      notFound.add(id);
      skippedNotFound++;
      continue;
    }

    const result = normaliseResult(calResult);

    for (const { rowId, source } of entries) {
      const key = `${source}|${rowId}|${calDate}`;
      if (existingKeys.has(key)) {
        skippedDuplicate++;
        continue;
      }
      existingKeys.add(key); // prevent double-insert within this run

      await run(
        `INSERT INTO CalibrationHistory
           (source, equipment_row_id, equipment_id, scheduled_date, performed_date,
            performed_by, result, measured_value, error_percent, cal_status, remark,
            file_name, file_path, created_by)
         VALUES (?,?,?,?,?, ?,?,?,?,?,?, ?,?,?)`,
        [
          source,
          rowId,
          id,
          calDate,   // scheduled_date = same as performed_date for historical data
          calDate,   // performed_date
          null,      // performed_by — unknown for historical records
          result,
          null,      // measured_value
          null,      // error_percent
          null,      // cal_status (no error% to compute)
          remark || null,
          null,      // file_name
          null,      // file_path
          null,      // created_by
        ]
      );
      inserted++;
    }
  }

  db.close();

  console.log('═══════════════════════════════════════════');
  console.log(`✅  Inserted:          ${inserted}`);
  console.log(`⏭️   Skipped (dup):     ${skippedDuplicate}`);
  console.log(`❌  Skipped (no match): ${skippedNotFound}`);
  console.log('═══════════════════════════════════════════');

  if (notFound.size > 0) {
    console.log(`\n⚠️  Equipment IDs not found in DB (${notFound.size}):`);
    [...notFound].sort().forEach(id => console.log(`   - ${id}`));
  }
  console.log('\nDone.\n');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
