/*
  Solar Tracker – ESP32
  8 LDR sensors, 2 servos (AZ + EL), OLED display, WebSocket telemetry
*/
#include <WiFi.h>
#include <Wire.h>
#include <Adafruit_SSD1306.h>
#include <ESP32Servo.h>
#include <ArduinoWebsockets.h>

using namespace websockets;

// ─── OLED ────────────────────────────────────────────────────────────────────
#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, -1);

// ─── LDR PINS (ADC1 only – safe with WiFi) ───────────────────────────────────
constexpr int PIN_N  = 32, PIN_S  = 33, PIN_E  = 34, PIN_W  = 35;
constexpr int PIN_NE = 36, PIN_NW = 39, PIN_SE = 27, PIN_SW = 25; // update to your actual ADC1 pins

// ─── SERVO PINS & POSITIONS ───────────────────────────────────────────────────
constexpr int SERVO_AZ_PIN = 18, SERVO_EL_PIN = 19;

struct Direction { const char* name; int az; int el; };

// Lookup table – add/remove entries freely
constexpr Direction DIRS[] = {
  {"N",    180, 90},
  {"S",      0, 90},
  {"E",    180,  0},
  {"W",      0,  0},
  {"NE",   180, 45},
  {"NW",   180, 45},
  {"SE",     0, 45},
  {"SW",     0, 45},
};
constexpr int NUM_DIRS = sizeof(DIRS) / sizeof(DIRS[0]);
constexpr int AZ_INIT = 60, EL_INIT = 0;

// ─── WIFI & WEBSOCKET ─────────────────────────────────────────────────────────
constexpr char WIFI_SSID[]  = "Maybrick";
constexpr char WIFI_PASS[]  = "laptopmine";
constexpr char WS_SERVER[]  = "ws://10.127.202.114:8080";

// ─── TUNING ───────────────────────────────────────────────────────────────────
constexpr int DARK_THRESHOLD  = 200;  // below this on ALL sensors → return to init
constexpr int DIFF_THRESHOLD  = 200;  // min gap between brightest & others
constexpr int SMOOTH_SAMPLES  = 5;    // rolling-average window
constexpr int SERVO_STEP      = 2;    // degrees per step
constexpr int SERVO_STEP_MS   = 15;   // ms between steps

// ─── GLOBALS ──────────────────────────────────────────────────────────────────
Servo servoAZ, servoEL;
WebsocketsClient wsClient;
int currentAZ = -1, currentEL = -1;

// Smoothing buffers – one per sensor
int smoothBuf[NUM_DIRS][SMOOTH_SAMPLES];
int smoothBufIdx = 0;
bool smoothBufFull = false;

// ─── HELPERS ──────────────────────────────────────────────────────────────────
int smoothRead(int newVal, int* buf) {
  buf[smoothBufIdx] = newVal;
  int count = smoothBufFull ? SMOOTH_SAMPLES : (smoothBufIdx + 1);
  int sum = 0;
  for (int i = 0; i < count; i++) sum += buf[i];
  return sum / count;
}

void moveTo(int az, int el) {
  az = constrain(az, 0, 180);
  el = constrain(el, 0, 180);
  if (az == currentAZ && el == currentEL) return;

  servoAZ.attach(SERVO_AZ_PIN);
  servoEL.attach(SERVO_EL_PIN);

  int a = (currentAZ < 0) ? az : currentAZ;
  int e = (currentEL < 0) ? el : currentEL;

  while (a != az || e != el) {
    if      (a < az) a = min(a + SERVO_STEP, az);
    else if (a > az) a = max(a - SERVO_STEP, az);
    if      (e < el) e = min(e + SERVO_STEP, el);
    else if (e > el) e = max(e - SERVO_STEP, el);

    servoAZ.write(a);
    servoEL.write(e);
    delay(SERVO_STEP_MS);
    yield();
  }

  currentAZ = az;
  currentEL = el;
  delay(200); yield();

  servoAZ.detach();  // release holding torque
  servoEL.detach();
}

// ─── WEBSOCKET CALLBACKS ──────────────────────────────────────────────────────
void onMessage(WebsocketsMessage msg) {
  Serial.print("[WS] "); Serial.println(msg.data());
}

void onEvent(WebsocketsEvent event, String) {
  switch (event) {
    case WebsocketsEvent::ConnectionOpened: Serial.println("[WS] Connected");    break;
    case WebsocketsEvent::ConnectionClosed: Serial.println("[WS] Disconnected"); break;
    case WebsocketsEvent::GotPing:          Serial.println("[WS] Ping");         break;
    default: break;
  }
}

// ─── SETUP ────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);

  // OLED
  Wire.begin(21, 22);
  Wire.setClock(100000);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED failed"); while (1) delay(1000);
  }
  display.clearDisplay();
  display.setTextSize(1); display.setTextColor(WHITE);
  display.setCursor(10, 20); display.println("Initializing...");
  display.display();

  // ADC
  analogReadResolution(12);
  for (int p : {PIN_N, PIN_S, PIN_E, PIN_W, PIN_NE, PIN_NW, PIN_SE, PIN_SW})
    analogSetPinAttenuation(p, ADC_11db);

  // Smooth buffers
  memset(smoothBuf, 0, sizeof(smoothBuf));

  // Servos – initial position
  moveTo(AZ_INIT, EL_INIT);

  // WiFi
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("WiFi connecting");
  for (int i = 0; i < 20 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500); Serial.print('.');
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? "\nWiFi OK" : "\nWiFi failed");
  if (WiFi.status() == WL_CONNECTED)
    Serial.println(WiFi.localIP());

  // WebSocket
  wsClient.onMessage(onMessage);
  wsClient.onEvent(onEvent);
  if (wsClient.connect(WS_SERVER)) wsClient.ping();
}

// ─── MAIN LOOP ────────────────────────────────────────────────────────────────
void loop() {
  wsClient.poll();
  yield();

  // --- Read & smooth all 8 sensors ---
  int pins[NUM_DIRS] = {PIN_N, PIN_S, PIN_E, PIN_W, PIN_NE, PIN_NW, PIN_SE, PIN_SW};
  int vals[NUM_DIRS];
  for (int i = 0; i < NUM_DIRS; i++)
    vals[i] = smoothRead(analogRead(pins[i]), smoothBuf[i]);

  // Advance shared buffer index
  smoothBufIdx = (smoothBufIdx + 1) % SMOOTH_SAMPLES;
  if (smoothBufIdx == 0) smoothBufFull = true;

  // --- Update OLED ---
  display.clearDisplay();
  display.setCursor(0, 0);
  for (int i = 0; i < NUM_DIRS; i++) {
    display.print(DIRS[i].name); display.print(": ");
    display.println(vals[i]);
  }
  display.display();
  yield();

  // --- All dark → return to init ---
  bool allDark = true;
  for (int i = 0; i < NUM_DIRS; i++) if (vals[i] >= DARK_THRESHOLD) { allDark = false; break; }
  if (allDark) { moveTo(AZ_INIT, EL_INIT); delay(500); return; }

  // --- Find brightest sensor ---
  int maxIdx = 0;
  for (int i = 1; i < NUM_DIRS; i++) if (vals[i] > vals[maxIdx]) maxIdx = i;

  // --- Ignore if no clear winner ---
  bool clearWinner = true;
  for (int i = 0; i < NUM_DIRS; i++)
    if (i != maxIdx && (vals[maxIdx] - vals[i]) < DIFF_THRESHOLD) { clearWinner = false; break; }
  if (!clearWinner) { delay(500); return; }

  // --- Move to brightest direction ---
  moveTo(DIRS[maxIdx].az, DIRS[maxIdx].el);

  // --- Send WebSocket telemetry ---
  String json = "[";
  for (int i = 0; i < NUM_DIRS; i++) {
    json += "{\""; json += DIRS[i].name; json += "\":"; json += vals[i]; json += "}";
    if (i < NUM_DIRS - 1) json += ",";
  }
  json += "]";
  wsClient.send(json);

  delay(500);
}
