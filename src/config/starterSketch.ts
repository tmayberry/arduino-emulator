export const STARTER_SKETCH = `void setup() {
  pinMode(TEST_LED_PIN, OUTPUT);
}

void loop() {
  digitalWrite(TEST_LED_PIN, HIGH);
  delay(1000);
  digitalWrite(TEST_LED_PIN, LOW);
  delay(1000);
}`;
