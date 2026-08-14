export const STARTER_SKETCH = `int red = 6;

void setup() {
  pinMode(red, OUTPUT);
}

void loop() {
  digitalWrite(red, 1);
  delay(1000);
  digitalWrite(red, 0);
  delay(1000);
}`;
