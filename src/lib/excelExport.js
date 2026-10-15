import * as XLSX from 'xlsx';

/**
 * Export survey records into an official formatted Excel spreadsheet (.xlsx).
 * Works 100% in browser (Local, Cloudflare R2, Vercel, Netlify).
 *
 * @param {Array} surveys - Array of survey objects
 * @param {string} customFilename - Output filename
 */
export function exportSurveysToExcel(surveys, customFilename) {
  if (!surveys || surveys.length === 0) return;

  const rows = surveys.map((item, idx) => {
    const fields = item.fields || {};
    return {
      'ลำดับ': idx + 1,
      'รหัสรายการ': item.recordId || fields.recordId || '-',
      'ชื่อสถานี': item.station || fields.station || '-',
      'จังหวัด': item.province || fields.province || '-',
      'อำเภอ': fields.district || '-',
      'ตำบล': fields.subdistrict || '-',
      'สถานที่ติดตั้ง': fields.installationPlace || fields.installation_place || '-',
      'สถานที่วางเครื่อง': fields.equipmentPlace || fields.equipment_place || '-',
      'ผลการพิจารณา': item.permit || fields.permit || '-',
      'ข้อจำกัดในการเข้าพื้นที่': fields.accessLimit || fields.access_limit || '-',
      'วันที่ตรวจเยี่ยม': fields.visitDate || fields.visit_date || '-',
      'เวลาตรวจเยี่ยม': fields.visitTime || fields.visit_time || '-',
      'ชื่อผู้ติดต่อ/ผู้ดูแล': fields.contactName || fields.informantName || '-',
      'เบอร์โทรศัพท์': fields.contactPhone || fields.phone || '-',
      'ตำแหน่งผู้ติดต่อ': fields.contactPosition || '-',
      'หน่วยงาน/หมู่บ้าน': fields.contactVillage || '-',
      'สภาพพื้นที่': fields.siteCondition || '-',
      'สภาพสายอากาศ': fields.antennaCondition || '-',
      'อุปสรรคการปฏิบัติงาน': fields.workObstacle || fields.work_obstacle || '-',
      'สถานะระบบวิทยุ': fields.radioStatus || '-',
      'สถานะระบบไฟฟ้า': fields.powerStatus || '-',
      'สถานะแบตเตอรี่': fields.batteryStatus || '-',
      'สถานะระบบกราวด์': fields.groundStatus || '-',
      'ปัญหาเพิ่มเติม': fields.userProblem || '-',
      'สรุปผลการตรวจเยี่ยม': fields.summary || '-',
      'ชื่อผู้ให้ข้อมูล': fields.informantName || fields.contactName || '-',
      'ผู้ตรวจเยี่ยม': fields.operatorName || '-',
      'จำนวนรูปถ่าย': (item.photos || fields.photos || []).length,
      'เวลาบันทึกลงระบบ': item.savedAt ? new Date(item.savedAt).toLocaleString('th-TH') : '-'
    };
  });

  const worksheet = XLSX.utils.json_to_sheet(rows);

  // Set column widths for readability
  worksheet['!cols'] = [
    { wch: 6 },  // ลำดับ
    { wch: 26 }, // รหัสรายการ
    { wch: 30 }, // ชื่อสถานี
    { wch: 16 }, // จังหวัด
    { wch: 16 }, // อำเภอ
    { wch: 16 }, // ตำบล
    { wch: 32 }, // สถานที่ติดตั้ง
    { wch: 28 }, // สถานที่วางเครื่อง
    { wch: 14 }, // ผลการพิจารณา
    { wch: 25 }, // ข้อจำกัด
    { wch: 15 }, // วันที่
    { wch: 10 }, // เวลา
    { wch: 22 }, // ผู้ติดต่อ
    { wch: 16 }, // เบอร์โทร
    { wch: 22 }, // ตำแหน่ง
    { wch: 24 }, // หมู่บ้าน
    { wch: 25 }, // สภาพพื้นที่
    { wch: 25 }, // สายอากาศ
    { wch: 25 }, // อุปสรรค
    { wch: 15 }, // วิทยุ
    { wch: 15 }, // ไฟฟ้า
    { wch: 15 }, // แบตเตอรี่
    { wch: 15 }, // กราวด์
    { wch: 25 }, // ปัญหา
    { wch: 35 }, // สรุป
    { wch: 22 }, // ผู้ให้ข้อมูล
    { wch: 20 }, // ผู้ตรวจ
    { wch: 12 }, // รูปถ่าย
    { wch: 20 }, // บันทึก
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'ผลการสำรวจ Pre-PM');
  const filename = customFilename || `SURVEY_DATA_${surveys.length}_STATIONS.xlsx`;
  XLSX.writeFile(workbook, filename);
}
