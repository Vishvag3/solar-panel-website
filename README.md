# Solar Tracker – ESP32 + WebSocket Dashboard
A two-servo solar tracking system built on the ESP32. Eight LDR sensors detect the brightest direction, the servos point there, and live readings stream to a browser dashboard over WebSocket.


## How It Works
8x LDR Sensors ->
ESP32 reads & smooths ADC values ->
Brightest direction? → Move servos (AZ + EL)->
Send JSON over WebSocket->
Node.js WS Server ->
Browser Dashboard 

1. All 8 LDRs are sampled and passed through a rolling average (5-sample window).
2. If all sensors are dark (< 200), the tracker remains in the current position.
3. If one sensor is clearly brightest (gap > 200 from others), both servos sweep to that direction.
4. Sensor readings are broadcast as JSON over WebSocket to any connected browser client.
