# Implementation Plan: Well-Known Ports Selection + Custom Ports

> **Status (netPad):** implemented in **simplified form (variant B)** — no `selected_ports` tables.
> Catalog: `backend/data/well_known_ports.json` · API: `GET /api/ports/well-known` · UI: `PortSelector` on Scans → settings CSV `quick_ports` / `scan_ports`. TCP only. See changelog Unreleased.

---

## 1. Модель данных

### Backend (SQLAlchemy)

**Новая таблица `well_known_ports`** (справочник, сидируется при старте/миграции):
```python
class WellKnownPort(Base):
    __tablename__ = "well_known_ports"
    id: int
    port: int
    protocol: str  # "tcp" | "udp"
    name: str          # "Portainer HTTP"
    category: str       # "self-hosted" | "infra" | "database" | "media" | "download"
    default_enabled: bool = False  # что предвыбрано в UI по умолчанию
```

**Изменение существующей сущности сканирования** (Network Planner / Scan Job — уточнить по актуальной схеме, но концептуально):
```python
class ScanPortConfig(Base):
    __tablename__ = "scan_port_configs"
    id: int
    scan_profile_id: int  # FK на профиль сканирования/юзера (single-user, но пусть будет профиль на будущее)
    port: int
    protocol: str
    source: str  # "well_known" | "custom"
    label: str | None  # опционально, только для custom — пользовательское имя
```

Вариант проще (если не нужен per-scan профиль, а просто глобальный список выбранных портов для LAN Hygiene): одна таблица `selected_ports` с теми же полями без `scan_profile_id`.

**Рекомендация:** учитывая, что MVP — однопользовательский, без мультипрофильности, беру второй вариант — плоский `selected_ports` с полем `source`.

## 2. Сидинг справочника портов

- Одноразовый seed-скрипт (или Alembic data migration) на основе таблицы известных портов — ~50 записей с категориями.
- Хранить как JSON-фикстуру (`seeds/well_known_ports.json`), а не хардкодить в коде — так проще потом добавлять/обновлять список без миграции схемы.
- При старте приложения (или через отдельную management-команду) — upsert по `(port, protocol)`, чтобы повторный запуск не плодил дубли и позволял обновлять список в новых версиях.

## 3. API endpoints (FastAPI)

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/ports/well-known` | список справочника, с фильтром по `?category=` |
| GET | `/api/ports/selected` | текущий выбранный набор портов для сканирования |
| PUT | `/api/ports/selected` | заменить весь набор (bulk) — тело: `{well_known_ports: [id,...], custom_ports: [{port, protocol, label}]}` |
| POST | `/api/ports/custom` | добавить один кастомный порт |
| DELETE | `/api/ports/custom/{id}` | удалить кастомный порт |

Валидация:
- `port` в диапазоне 1–65535
- `protocol` только `tcp`/`udp`
- дубликаты (port+protocol) отклоняются с 409, независимо well-known это или custom (нельзя добавить кастомный порт, который уже есть в списке выбранных well-known)

## 4. Frontend (React + Tailwind)

### Компонент `PortSelector`
Место: страница Hygiene (настройки скана) или отдельная секция Settings.

- **Список well-known портов**, сгруппированный по `category` (аккордеон/табы: Infra, Self-hosted, Database, Media, Download)
- Чекбоксы, с поиском по имени/номеру порта (фильтр на клиенте, справочник небольшой)
- Кнопка "выбрать всё в категории" / "снять всё"
- **Блок Custom Ports**: инлайн-форма (порт + протокол + опциональный label) + список уже добавленных с кнопкой удаления
- Счётчик "выбрано N портов" вверху
- Кнопка "Сохранить" → `PUT /api/ports/selected`

### State
- React Query (или что уже используется в проекте) для кэша справочника и текущего выбора
- Optimistic update при добавлении/удалении custom порта

## 5. Интеграция со сканером

- Сканер (ping-sweep + `arp -a` сейчас, порт-скан — видимо socket connect-scan по TCP) читает актуальный список из `selected_ports` перед запуском джобы, а не хардкожен
- Если список пуст — либо блокировать запуск с сообщением "выберите хотя бы один порт", либо fallback на дефолтный минимальный набор (22, 80, 443)
- Результат скана по-прежнему пишется в `DeviceEvent`/открытые порты как сейчас — тип порта (well-known/custom) на результат не влияет, это только конфигурация *что* сканировать

## 6. Опционально (не в MVP, но заложить в архитектуру)
- Banner grab / HTTP title fetch для дизамбигуации портов-коллизий (8080, 3000 и т.п.)
- Пресеты ("быстрый скан" = топ-20 портов, "полный self-hosted" = все self-hosted категории)

## 7. Этапы работы (последовательность PR'ов)

1. Миграция + seed справочника `well_known_ports`
2. Миграция `selected_ports` (пустая по умолчанию либо с дефолтным набором из `default_enabled`)
3. API endpoints (GET/PUT well-known + selected)
4. API для custom портов (POST/DELETE) + валидация дублей
5. Frontend: `PortSelector` компонент, только чтение + чекбоксы
6. Frontend: форма добавления custom портов
7. Интеграция: сканер читает `selected_ports` вместо хардкода
8. UI-полировка: категории/поиск/пресеты (если нужно)
