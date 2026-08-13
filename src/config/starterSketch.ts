export const STARTER_SKETCH = `int red = 6;

void setup() {
  pinMode(red, OUTPUT);
}

void loop() {
  digitalWrite(red, HIGH);
  delay(1000);
  digitalWrite(red, LOW);
  delay(1000);
}`;
