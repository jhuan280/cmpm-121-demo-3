import "./style.css";

const app: HTMLDivElement = document.querySelector("#app")!;

//------------Button----------------//
const messageButton = document.createElement("button");
messageButton.textContent = "Click me!";
messageButton.classList.add("message-button");

// Append the new button to the app div
app.appendChild(messageButton);

// Add a click event listener to the new button
messageButton.addEventListener("click", () => {
  alert("You clicked the button!");
});

//test
