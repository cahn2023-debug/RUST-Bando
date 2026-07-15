import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  vi: {
    translation: {
      "common": {
        "loading": "Đang tải...",
        "save": "Lưu",
        "delete": "Xóa",
        "cancel": "Hủy",
        "confirm": "Xác nhận",
        "search": "Tìm kiếm"
      },
      "project": {
        "tasks": "Công việc",
        "notes": "Ghi chú",
        "files": "Tệp tin",
        "contracts": "Hợp đồng",
        "design": "Thiết kế",
        "resources": "Tài nguyên",
        "operate": "Vận hành"
      },
      "task": {
        "todo": "Cần làm",
        "doing": "Đang làm",
        "done": "Hoàn thành",
        "add_task": "Thêm công việc",
        "new_group": "Nhóm mới",
        "description": "Mô tả",
        "timeline": "Tiến trình"
      },
      "sync": {
        "pushing": "Đang đẩy thay đổi...",
        "pulling": "Đang tải thay đổi...",
        "offline": "Thiết bị đang ngoại tuyến"
      },
      "nav": {
        "dashboard": "Bảng điều khiển",
        "files": "Tệp tin",
        "settings": "Cài đặt"
      }
    }
  },
  en: {
    translation: {
      "common": {
        "loading": "Loading...",
        "save": "Save",
        "delete": "Delete",
        "cancel": "Cancel",
        "confirm": "Confirm",
        "search": "Search"
      },
      "project": {
        "tasks": "Tasks",
        "notes": "Notes",
        "files": "Files",
        "contracts": "Contracts",
        "design": "Design",
        "resources": "Resources",
        "operate": "Operate"
      },
      "task": {
        "todo": "To Do",
        "doing": "Doing",
        "done": "Done",
        "add_task": "Add Task",
        "new_group": "New Group",
        "description": "Description",
        "timeline": "Timeline"
      },
      "sync": {
        "pushing": "Pushing changes...",
        "pulling": "Pulling changes...",
        "offline": "Device is offline"
      },
      "nav": {
        "dashboard": "Dashboard",
        "files": "Files",
        "settings": "Settings"
      }
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'vi',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;
