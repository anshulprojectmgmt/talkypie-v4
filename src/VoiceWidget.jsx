import React, { useEffect, useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { usePorcupine } from "@picovoice/porcupine-react";
import axios from "axios";
import Vapi from "@vapi-ai/web";
import {
  FiPhoneCall,
  FiPhoneOff,
  FiLoader,
  FiMic,
  FiMicOff,
} from "react-icons/fi";
import {
  FaRobot,
  FaExclamationTriangle,
  FaCheckCircle,
  FaVolumeUp,
  FaWifi,
} from "react-icons/fa";
// Corrected:
import { MdWifiOff } from "react-icons/md"; // ✅ correct package
import { useESP32 } from "./contexts/ESP32Context";
import { useMicrophone } from "./contexts/MicrophoneContext";

// will initialize Vapi instance once assistant is created
let vapi;
let introAudioIntervalID;
const VoiceWidget = () => {
  // Microphone context
  const { stream, setStream } = useMicrophone();

  // Microphone mute state
  const [isMicMuted, setIsMicMuted] = useState(false);

  // Toggle microphone mute/unmute
  const toggleMicrophone = () => {
    // Vapi SDK mute/unmute logic
    if (
      typeof vapi !== "undefined" &&
      vapi &&
      typeof vapi.setMuted === "function"
    ) {
      vapi.setMuted(!isMicMuted);
      setIsMicMuted((prev) => !prev);
      console.log(
        !isMicMuted ? "Microphone muted (Vapi)" : "Microphone unmuted (Vapi)",
      );
    } else {
      // fallback: globally mute all active microphone streams`
      console.warn(
        "Vapi instance not available, falling back to global mic mute.",
      );
    }
  };
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const {
    espCharacteristic,
    isConnected,
    connectionLost,
    acknowledgeConnectionLoss,
  } = useESP32();

  const vapiRef = useRef(null);
  const errorAudioIntervalRef = useRef(null);
  const [isAssistantOn, setIsAssistantOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [childName, setChildName] = useState(
    queryParams.get("childName") || "",
  );
  const [interests, setInterests] = useState(
    queryParams.get("interests") || "",
  );
  const [age, setAge] = useState(queryParams.get("age") || ""); //new
  const [gender, setGender] = useState(queryParams.get("gender") || ""); //new
  const [currentLearning, setCurrentLearning] = useState(
    queryParams.get("currentLearning") || "",
  );
  const [prompt, setPrompt] = useState(queryParams.get("prompt") || "");
  const [porcupineKey, setPorcupineKey] = useState(
    queryParams.get("porcupineKey") || "",
  );
  const [toyName, setToyName] = useState(
    queryParams.get("toyName") || "Talkypie",
  );
  const [isFormSubmitted, setIsFormSubmitted] = useState(
    queryParams.get("isFormSubmitted") === "true",
  );
  const customTranscript = queryParams.get("customTranscript") === "true";

  const [wakeWordDetected, setWakeWordDetected] = useState(false);
  const [assistantId, setAssistantId] = useState(null);
  const [mediaDetection, setMediaDetect] = useState(false);

  // Assistant creation states
  const [assistantStatus, setAssistantStatus] = useState("pending"); // pending, created, failed
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const isAssistantOnRef = useRef(isAssistantOn);
  const inactivityTimeoutRef = useRef(null);
  const wakeUpIntervalRef = useRef(null);
  const wakeUpAudioRef = useRef(null);
  const deepgramSocketRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const assistantSpeakingRef = useRef(false);
  const userSpeakingRef = useRef(false);
  const userSilenceTimerRef = useRef(null);

  const DEEPGRAM_API_KEY = "2434d902a6a617075faae7044e92fca628228f9a";

  // Get VAPI keys from localStorage or URL params
  const vapiPrivateKey =
    queryParams.get("vapiKey") || localStorage.getItem("vapiKey");
  const vapiPublicKey =
    queryParams.get("vapiPublicKey") ||
    localStorage.getItem("vapiPublicKey") ||
    "1f568b16-001f-4f1c-8f34-02a4aa1ea376";

  // "57bd3c84-dd46-41ce-82ab-2bbe48163d90";

  const {
    keywordDetection,
    isLoaded,
    isListening,
    error,
    init,
    start,
    stop,
    release,
  } = usePorcupine();

  const porcupineKeyword = {
    publicPath: "assets/Hi-coco_en_wasm_v3_0_0.ppn",
    label: "Hello coco",
  };

  const porcupineModel = {
    publicPath: "assets/porcupine_params.pv",
  };

  useEffect(() => {
    console.log("isAssistantOn changed:", isAssistantOn);
    isAssistantOnRef.current = isAssistantOn;
  }, [isAssistantOn]);

  //To get the assistant id on disconnect form the local storage
  useEffect(() => {
    const savedId = localStorage.getItem("assistantId");

    if (savedId) {
      console.log("Restoring assistantId:", savedId);
      setAssistantId(savedId);
      setAssistantStatus("created");
    }
  }, []);

  // Setup ESP32 characteristic and event listener
  useEffect(() => {
    if (espCharacteristic) {
      console.log("ESP32 characteristic available, setting up event listener");

      // Add event listener for ESP32 characteristic value changes
      const handleCharacteristicValueChanged = async (event) => {
        const value = new TextDecoder().decode(event.target.value);
        console.log("Received from ESP:", value);
        // if (value === "SUPPORT") {
        //   console.log("ESP32 SUPPORT signal received, toggling assistant");
        //   toggleAssistant();
        // }
        if (value === "SUPPORT") {
          console.log("Hardware button pressed");

          if (!assistantId) {
            console.log("Assistant not created. Creating...");
            await createAssistant();
          } else {
            toggleAssistant();
          }
        }
      };

      // Enable notifications and add event listener
      espCharacteristic
        .startNotifications()
        .then(() => {
          espCharacteristic.addEventListener(
            "characteristicvaluechanged",
            handleCharacteristicValueChanged,
          );
          console.log("ESP32 characteristic event listener added");
        })
        .catch((err) => {
          console.error("Failed to start ESP32 notifications:", err);
        });

      // Cleanup function
      return () => {
        if (espCharacteristic) {
          espCharacteristic.removeEventListener(
            "characteristicvaluechanged",
            handleCharacteristicValueChanged,
          );
          console.log("ESP32 characteristic event listener removed");
        }
      };
    } else {
      console.log("ESP32 characteristic not available");
    }
  }, [espCharacteristic]);

  // Function to play error audio
  const playErrorAudio = (errorMessage) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(errorMessage);
      utterance.rate = 0.8;
      utterance.pitch = 1;
      utterance.volume = 0.8;
      speechSynthesis.speak(utterance);
    }
  };

  // Function to start error audio interval
  const startErrorAudioInterval = (errorMessage) => {
    // Clear any existing interval
    if (errorAudioIntervalRef.current) {
      clearInterval(errorAudioIntervalRef.current);
    }

    // Play immediately
    playErrorAudio(errorMessage);

    // Set up interval to play every 10 seconds
    errorAudioIntervalRef.current = setInterval(() => {
      playErrorAudio(errorMessage);
    }, 10000);
  };

  // Function to stop error audio interval
  const stopErrorAudioInterval = () => {
    if (errorAudioIntervalRef.current) {
      clearInterval(errorAudioIntervalRef.current);
      errorAudioIntervalRef.current = null;
    }
    // Stop any ongoing speech
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
  };

  // Create assistant when component mounts
  // step-1
  const createAssistant = async () => {
    if (!childName) {
      console.log("Missing required parameters");
      setAssistantStatus("failed");
      const errorMsg = "Missing required information for assistant creation.";
      setAssistantError(errorMsg);
      startErrorAudioInterval(errorMsg);
      return;
    }

    try {
      setIsCreatingAssistant(true);
      setAssistantError("");
      stopErrorAudioInterval(); // Stop any previous error audio

      let customPrompt = ``;
      if (interests) {
        customPrompt += "Child's Interests & Preferences: ${interests}\n";
      }
      if (currentLearning) {
        customPrompt += " Current Learning in School: ${currentLearning}\n";
      }

      // https://api-talkypies.vercel.app
      // http://localhost:5000
      // https://https://talkypie-vapi-backend.onrender.com/vapi/create-assistant
      const response = await axios.post(
        "https://talkypie-backend-v3.onrender.com/vapi/create-assistant",
        // "http://localhost:5000/vapi/create-assistant",
        // http://guidable-axton-forky.ngrok-free.dev
        {
          childName,
          age,
          gender,
          customPrompt,
          vapiKey: vapiPrivateKey,
          prompt,
          toyName,
          customTranscript,
        },
      );

      console.log("Assistant created:", response);
      const newAssistantId = response.data.assistantId;
      const receivedFinalPrompt = response.data.finalPrompt;

      // Initialize VAPI with public key for client SDK

      vapi = new Vapi(vapiPublicKey);
      setAssistantId(newAssistantId);
      setFinalPrompt(receivedFinalPrompt || "");
      setAssistantStatus("created");
      setIsLoading(true);
      //  const audio = new Audio("/connect.mp3");
      // audio.play();
      // Store assistant ID for later use
      localStorage.setItem("assistantId", newAssistantId);
    } catch (error) {
      console.error("Failed to create assistant:", error);
      setAssistantStatus("failed");

      let errorMsg = "";
      if (
        error.response?.status === 402 ||
        error.response?.data?.message?.includes("credits")
      ) {
        errorMsg =
          "VAPI credits exhausted. Please check your VAPI account and add more credits.";
      } else if (error.response?.status === 401) {
        errorMsg =
          "Invalid VAPI private key. Please check your VAPI private key and try again.";
      } else {
        errorMsg =
          "Failed to create AI assistant. Please check your VAPI private key and try again.";
      }

      setAssistantError(errorMsg);
      startErrorAudioInterval(errorMsg);
    } finally {
      setIsCreatingAssistant(false);
    }
  };

  // step-2 start the assistant when created
  useEffect(() => {
    if (assistantId && assistantStatus === "created") {
      toggleAssistant(); // Start the assistant if it was created successfully
    }
  }, [assistantId, assistantStatus]);

  // Auto-create assistant when component mounts
  useEffect(() => {
    if (isFormSubmitted && childName && assistantStatus === "pending") {
      createAssistant();
    }
  }, [isFormSubmitted, childName, vapiPrivateKey]);

  // Cleanup error audio interval on component unmount
  useEffect(() => {
    return () => {
      stopErrorAudioInterval();
    };
  }, []);

  const sendBlinkCommand = async () => {
    try {
      if (!espCharacteristic) return;
      const encoder = new TextEncoder();
      await espCharacteristic.writeValue(encoder.encode("BLINK"));
    } catch (error) {
      console.error("Failed to send blink command:", error);
    }
  };

  const sendOnCommand = async () => {
    try {
      if (!espCharacteristic) return;
      const encoder = new TextEncoder();
      await espCharacteristic.writeValue(encoder.encode("ON"));
    } catch (error) {
      console.error("Failed to send on command:", error);
    }
  };

  // step-8
  const sendOffCommand = async () => {
    try {
      if (!espCharacteristic) return;
      const encoder = new TextEncoder();
      await espCharacteristic.writeValue(encoder.encode("STOP"));
    } catch (error) {
      console.error("Failed to send off command:", error);
    }
  };

  const resetInactivityTimer = () => {
    if (inactivityTimeoutRef.current) {
      clearTimeout(inactivityTimeoutRef.current);
    }

    inactivityTimeoutRef.current = setTimeout(() => {
      console.log("Inactivity timeout reached. Closing Vapi...");
      setIsLoading(true);
      const audio = new Audio("/disconnect.mp3");
      audio.play();
      audio.onended = () => {
        console.log("stop assistant & offCMD after disconnect audio");

        toggleAssistant();
      };
    }, 1000);
  };

  // Attempt to halt assistant audio mid-response when the user starts speaking
  const interruptAssistantResponse = () => {
    if (!vapi) return;

    try {
      if (typeof vapi.interrupt === "function") {
        vapi.interrupt();
        console.log("Vapi interrupt invoked due to user speech.");
        return;
      }

      if (typeof vapi.pause === "function") {
        vapi.pause();
        console.log("Vapi pause invoked due to user speech.");
        return;
      }

      // Fallback: try muting output quickly if no explicit interrupt API exists
      if (typeof vapi.setMuted === "function") {
        vapi.setMuted(true);
        console.log("Vapi muted as a fallback during user speech.");
        setTimeout(() => {
          if (userSpeakingRef.current) return;
          vapi.setMuted(false);
          console.log("Vapi unmuted after fallback mute.");
        }, 1200);
      }
    } catch (e) {
      console.warn("Failed to interrupt assistant response:", e);
    }
  };

  const markUserSpeaking = () => {
    userSpeakingRef.current = true;
    if (userSilenceTimerRef.current) {
      clearTimeout(userSilenceTimerRef.current);
    }

    // Assume user stops speaking if no transcript arrives for a short window
    userSilenceTimerRef.current = setTimeout(() => {
      userSpeakingRef.current = false;
      if (typeof vapi?.resume === "function") {
        try {
          vapi.resume();
          console.log("Vapi resumed after user silence.");
        } catch (e) {
          console.warn("Failed to resume Vapi after silence:", e);
        }
      }
    }, 1200);
  };

  useEffect(() => {
    if (isFormSubmitted && assistantStatus === "created") {
      init(porcupineKey, porcupineKeyword, porcupineModel)
        .then(() => {
          start();
        })
        .catch((err) => {
          console.error("Error initializing Porcupine:", err);
        });
    }
    return () => release();
  }, [init, start, release, isFormSubmitted, porcupineKey, assistantStatus]);

  // new setup for deepgram and wake word

  // useEffect to manage wake up audio
  useEffect(() => {
    if (
      !isFormSubmitted ||
      assistantStatus !== "created" ||
      mediaDetection ||
      wakeWordDetected ||
      isAssistantOn ||
      isAssistantOnRef.current ||
      isLoading
    )
      return;

    console.log("🔁 Assistant idle — Starting wake audio + Deepgram");

    // === Wake up.mp3 Setup ===
    const audio = new Audio("/wake up.mp3");
    audio.loop = false;

    const playAudio = () => {
      if (!audio.paused) return;
      console.log("🔊 Replaying wake up.mp3...");
      audio.currentTime = 0;
      audio.play().catch((e) => console.warn("Audio play failed:", e));
      wakeUpAudioRef.current = audio;
    };

    // Play initially
    audio.play().catch((e) => console.warn("Initial play failed:", e));
    wakeUpAudioRef.current = audio;

    // Loop every 10s until wake word is detected or assistant is turned on
    const intervalId = setInterval(() => {
      if (!wakeWordDetected && !isAssistantOnRef.current) {
        playAudio();
      }
    }, 10000);

    // === Deepgram Setup ===

    const initializeDeepgram = async () => {
      try {
        // Cleanup
        // deepgramSocketRef.current?.close?.();
        // if (mediaRecorderRef.current?.state && mediaRecorderRef.current.state !== "inactive") {
        //     mediaRecorderRef.current.stop();
        //   }
        // mediaStreamRef.current?.getTracks().forEach(t => t.stop());

        // Create WebSocket
        const socket = new WebSocket(
          "wss://api.deepgram.com/v1/listen?punctuate=true&language=en",
          ["token", DEEPGRAM_API_KEY],
        );
        deepgramSocketRef.current = socket;

        socket.onopen = async () => {
          try {
            // if(!stream) {
            //   const userStream = await navigator.mediaDevices.getUserMedia({
            //   audio: true,
            //   });
            //   setStream(userStream);
            // }
            const stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
            });
            mediaStreamRef.current = stream;

            const recorder = new MediaRecorder(stream, {
              mimeType: "audio/webm",
            });
            mediaRecorderRef.current = recorder;

            recorder.ondataavailable = (e) =>
              e.data.size > 0 && socket.readyState === 1 && socket.send(e.data);
            recorder.start(250);
            console.log("🎙 Deepgram listening...");
          } catch (err) {
            console.error("Mic error:", err);
            setErrorMessage("Microphone error: " + err.message);
          }
        };

        socket.onmessage = ({ data }) => {
          if (isAssistantOnRef.current) return;

          const transcript =
            JSON.parse(
              data,
            )?.channel?.alternatives?.[0]?.transcript?.toLowerCase();
          const triggers = [
            "help me",
            "hi eva",
            "eva",
            "hello eva",
            "hey eva",
            "hello",
            "hi coco",
            "coco",
            "hello coco",
          ];
          if (transcript && triggers.some((w) => transcript.includes(w))) {
            console.log("🟢 Wake word:", transcript);
            setWakeWordDetected(true);
            triggerVapi();
            socket.close();
            mediaRecorderRef.current?.stop();
            mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
          }
        };

        socket.onerror = (e) => setErrorMessage("Deepgram error.");
        socket.onclose = () => console.log("🔌 Deepgram closed");
      } catch (e) {
        console.error("Deepgram init failed:", e);
      }
    };

    initializeDeepgram();

    // === Cleanup Both Audio & Deepgram ===
    return () => {
      console.log("🧹 Cleanup Deepgram + Audio");
      audio.pause?.();
      clearInterval(intervalId);

      deepgramSocketRef.current?.close?.();
      if (
        mediaRecorderRef.current?.state &&
        mediaRecorderRef.current.state !== "inactive"
      ) {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [
    isFormSubmitted,
    assistantStatus,
    mediaDetection,
    wakeWordDetected,
    isAssistantOn,
    isLoading,
  ]);

  useEffect(() => {
    if (keywordDetection) {
      console.log("Wake word detected:", keywordDetection.label);
      setWakeWordDetected(true);
    }
  }, [keywordDetection]);

  // step-4
  const introAudio = async () => {
    console.log("Starting intro audio... before connecting tovapi");

    // Stop any wake-up audio interval
    if (wakeUpAudioRef.current) {
      wakeUpAudioRef.current.pause(); // Pause any ongoing wake-up audio
      console.log("Paused wake-up audio before starting intro audio.");
      wakeUpAudioRef.current.currentTime = 0; // Reset the audio to the beginning
    }

    // step-5
    const audio = new Audio("/connect.mp3");
    await audio.play();
    await new Promise((resolve) => {
      audio.onended = () => {
        console.log("waait until intro audio finished");
        resolve();
      };
    });

    // step-6
    await sendBlinkCommand();

    let repeatedAudio;

    // Repeat the intro audio every 5 seconds until speech starts
    introAudioIntervalID = setInterval(() => {
      repeatedAudio = new Audio(audio.src);
      repeatedAudio.play();
      console.log("Playing intro audio...");
    }, 5000);

    vapi.once("speech-start", async () => {
      repeatedAudio.pause();
      console.log("speech-start called only once");
      console.log("Assistant has started speaking.");
      clearInterval(introAudioIntervalID);
      sendOnCommand();
      console.log("Eva connected. Stopped repeating audio.");
    });
  };

  // start listening for wake word and toggle assistant when detected
  useEffect(() => {
    if (
      (mediaDetection || wakeWordDetected) &&
      isFormSubmitted &&
      assistantStatus === "created"
    ) {
      if (isAssistantOnRef.current) {
        console.log("Assistant is already on, no need to start again.");
        return;
      }

      setIsLoading(true);
      // direct call toggleAssistant and inside it call introAudio fun
      toggleAssistant();

      return () => {
        // clearInterval(introAudioIntervalID);
      };
    }
  }, [wakeWordDetected, isFormSubmitted, mediaDetection, assistantStatus]);

  useEffect(() => {
    if (!isFormSubmitted) return;

    const socket = new WebSocket(
      "wss://talkypie-backend-v3.onrender.com/api/custom-transcriber",
    );

    socket.onopen = () => {
      console.log("Connected to backend WebSocket");
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("Parsed data from backend:", data);

        if (
          data.type === "MEDIA_KEY" &&
          data.message.toLowerCase().includes("next")
        ) {
          setMediaDetect(true);
        }
      } catch (err) {
        console.error("Invalid JSON from backend:", event.data);
      }
    };

    socket.onerror = (err) => {
      console.error("WebSocket error:", err);
    };

    return () => {
      socket.close();
    };
  }, [isFormSubmitted]);

  // step-6
  const startVapiAssistant = async () => {
    if (!assistantId) {
      console.error("No assistant ID available");
      return;
    }

    setIsLoading(true);
    try {
      const call = await vapi.start(assistantId);
      console.log("Call started:", call);
      setIsLoading(false);
      setIsAssistantOn(true);
      isAssistantOnRef.current = true;

      // For listening assistants talking and listning states

      vapi.on("speech-start", () => {
        assistantSpeakingRef.current = true;
        sendOnCommand();
      });

      vapi.on("speech-end", () => {
        assistantSpeakingRef.current = false;
        sendBlinkCommand();
      });
      //new
      // Listen for transcript messages from Vapi so we can detect farewell phrases
      const farewellHandler = (message) => {
        try {
          if (message?.type === "transcript") {
            const text = (message.transcript || "").toLowerCase();
            const isUser =
              message.role === "user" ||
              message.role === "speaker" ||
              message.role === 0;
            if (isUser) {
              markUserSpeaking();
              if (assistantSpeakingRef.current) {
                interruptAssistantResponse();
              }
            }
            if (!isUser) return;

            const farewells = [
              "bye bye",
              "goodbye",
              "bye",
              "see you",
              "see ya",
            ];
            if (farewells.some((f) => text.includes(f))) {
              console.log(
                "Farewell detected in transcript, ending call:",
                text,
              );
              // Prevent double-invokes by checking the ref
              if (isAssistantOnRef.current) {
                // Use toggleAssistant which performs the proper shutdown sequence
                toggleAssistant();
              }
            }
          }
        } catch (e) {
          console.error("Error in farewellHandler:", e);
        }
      };

      // Register handler if supported by the SDK
      try {
        vapi.on("message", farewellHandler);
      } catch (e) {
        console.warn(
          "Vapi does not support message events or registering failed:",
          e,
        );
      }
      //new
      // when the assistant ended the call implicitly, we have to manually perform end call operations
      vapi.once("call-end", () => {
        console.log(
          "Call ended event received",
          isAssistantOn,
          "  ",
          isAssistantOnRef.current,
        );

        //new
        // Try to remove the message handler if SDK supports removal
        try {
          if (typeof vapi.off === "function") {
            vapi.off("message");
          }
        } catch (e) {
          console.warn("Failed to remove message listener on call-end:", e);
        }
        //new
        if (isAssistantOn || isAssistantOnRef.current) {
          // resetInactivityTimer();
          toggleAssistant(); // Call toggleAssistant to handle end call processing
        }
      });
    } catch (error) {
      console.error("Error starting call:", error);
      setIsLoading(false);
      clearInterval(introAudioIntervalID); // Stop repeating intro audio
      setWakeWordDetected(false);
      setMediaDetect(false);
      // if vapi failed to start call, stop the intro audio interval and show a popup message
      // to the user that failed to connect please try again. taost duration: 2sec.
    }
  };

  // step-7
  const endCallProcessing = async () => {
    console.log("End call processing started..... before stopping Vapi");
    try {
      const audio = new Audio("/disconnect.mp3");
      await audio.play();
      await new Promise((resolve) => {
        audio.onended = () => {
          console.log("wait until disconnect audio finished");
          resolve();
        };
      });

      await sendOffCommand();
    } catch (error) {
      console.error("Error processing end call:", error);
    }
  };

  useEffect(() => {
    return () => {
      console.log(
        "Cleaning up on unmount, stopping Vapi and sending off command: ",
        isAssistantOnRef.current,
        "|| ",
        isAssistantOn,
      );
      if (isAssistantOnRef.current) {
        console.log(
          "Cleaning up on unmount, stopping Vapi and sending off command",
        );
        toggleAssistant(); // Ensure assistant is turned off}
      }

      if (userSilenceTimerRef.current) {
        clearTimeout(userSilenceTimerRef.current);
      }
    };
  }, []);

  // step-3 toggle assistant on/off
  const toggleAssistant = async () => {
    // console.log("assistant status from ref: inside ", isAssistantOnRef.current);
    // 🔒 Prevent reconnect if ID missing
    if (!assistantId && !isAssistantOnRef.current) {
      console.warn("Assistant ID missing. Creating assistant...");
      await createAssistant();
      return;
    }

    if (isAssistantOnRef.current) {
      setIsLoading(true);
      vapi.setMuted(false);
      setIsMicMuted(false);
      vapi.stop();
      setIsAssistantOn(false);
      isAssistantOnRef.current = false;

      await endCallProcessing();
      console.log("call disconnected");

      setIsLoading(false);
      setWakeWordDetected(false);
      setMediaDetect(false);
    } else {
      // await sendOnCommand();
      setIsLoading(true);
      await introAudio();
      startVapiAssistant();
    }
  };

  const retryCreateAssistant = () => {
    setAssistantStatus("pending");
    setAssistantError("");
    stopErrorAudioInterval(); // Stop error audio when retrying
    createAssistant();
  };

  if (error) {
    <div>Error initializing Porcupine: {error.message}</div>;
  }

  // Show connection lost warning
  if (connectionLost) {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-xl mb-20 md:mb-0">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <MdWifiOff className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Connection Lost</h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-700 text-sm mb-3">
              Your ESP32 connection was lost due to a page reload. Please
              reconnect your Talkypie device to continue.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => (window.location.href = "/permissions")}
                className="w-full py-2 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 transition-all duration-300"
              >
                Reconnect Talkypie
              </button>
              <button
                onClick={acknowledgeConnectionLoss}
                className="w-full py-2 px-4 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-all duration-300"
              >
                Continue Without Hardware
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show loading state while creating assistant
  if (assistantStatus === "pending" || isCreatingAssistant) {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-xl mb-20 md:mb-0">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <FiLoader className="w-12 h-12 text-indigo-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Setting up your AI Assistant
          </h2>
          <p className="text-gray-600">
            Creating a personalized assistant for {childName} with {toyName}...
          </p>
          <div className="bg-indigo-50 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <FaRobot className="text-2xl text-indigo-600" />
              <div className="text-left">
                <p className="font-semibold text-indigo-900">
                  Personalizing Experience
                </p>
                <p className="text-sm text-indigo-700">
                  This may take a few moments
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error state if assistant creation failed
  if (assistantStatus === "failed") {
    return (
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-xl mb-20 md:mb-0">
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center">
            <FaExclamationTriangle className="w-12 h-12 text-red-500" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">
            Assistant Setup Failed
          </h2>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <FaVolumeUp className="text-red-500" />
              <p className="text-red-700 text-sm font-medium">
                Audio Error Notifications Active
              </p>
            </div>
            <p className="text-red-700 text-sm">{assistantError}</p>
          </div>
          <button
            onClick={retryCreateAssistant}
            disabled={isCreatingAssistant}
            className="w-full py-3 px-4 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300"
          >
            {isCreatingAssistant ? "Retrying..." : "Retry Setup"}
          </button>
          <button
            onClick={stopErrorAudioInterval}
            className="w-full py-2 px-4 bg-gray-600 text-white font-medium rounded-lg hover:bg-gray-700 transition-all duration-300"
          >
            Stop Audio Notifications
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto mb-20 md:mb-0 space-y-6">
      {/* Main Voice Widget */}
      <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-xl">
        <div className="space-y-4">
          {/* Assistant Ready Indicator */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
            <div className="flex items-center gap-2">
              <FaCheckCircle className="text-green-500 text-lg" />
              <p className="text-green-700 text-sm font-medium">
                {toyName} AI Assistant ready for {childName}!
              </p>
            </div>
          </div>

          <h1 className="text-2xl font-bold text-center text-gray-900">
            Voice Assistant Status
          </h1>
          <div className="space-y-2 text-lg">
            <p className="text-gray-700">
              Listening:{" "}
              <span
                className={`font-semibold ${
                  isListening ? "text-green-600" : "text-red-600"
                }`}
              >
                {isAssistantOn || isListening ? "Active" : "Inactive"}
              </span>
            </p>
            <p className="text-gray-700">
              Wake Word Detection:{" "}
              <span
                className={`font-semibold ${
                  wakeWordDetected ? "text-green-600" : "text-yellow-600"
                }`}
              >
                {wakeWordDetected
                  ? "Detected! Vapi is ready."
                  : "Waiting for 'Hello coco'..."}
              </span>
            </p>
            <p className="text-gray-700">
              ESP32 Connection:{" "}
              <span
                className={`font-semibold flex items-center gap-1 ${
                  isConnected ? "text-green-600" : "text-red-600"
                }`}
              >
                {isConnected ? (
                  <>
                    <FaWifi className="text-sm" />
                    Connected & Listening
                  </>
                ) : (
                  <>
                    <MdWifiOff className="text-sm" />
                    Not Connected
                  </>
                )}
              </span>
            </p>
          </div>

          <div className="flex justify-center">
            <div className="flex gap-4">
              <button
                onClick={toggleAssistant}
                className={`rounded-full p-4 text-white shadow-lg transition-transform duration-300 ease-in-out ${
                  isAssistantOn
                    ? "bg-red-600 hover:bg-red-700"
                    : isLoading
                      ? "bg-yellow-500"
                      : "bg-green-600 hover:bg-green-700"
                }`}
                disabled={isLoading}
                title={isAssistantOn ? "Disconnect" : "Connect"}
              >
                {isLoading ? (
                  <FiLoader className="w-8 h-8 animate-spin" />
                ) : isAssistantOn ? (
                  <FiPhoneOff className="w-8 h-8" />
                ) : (
                  <FiPhoneCall className="w-8 h-8 animate-pulse" />
                )}
              </button>
              {isAssistantOn && (
                <button
                  onClick={toggleMicrophone}
                  className={`rounded-full p-4 shadow-lg transition-transform duration-300 ease-in-out ${
                    !stream
                      ? "bg-gray-400 text-gray-200 cursor-not-allowed"
                      : isMicMuted
                        ? "bg-red-600 text-white hover:bg-red-700"
                        : "bg-blue-600 text-white hover:bg-blue-700"
                  }`}
                  disabled={!stream}
                  title={
                    !stream
                      ? "Microphone unavailable"
                      : isMicMuted
                        ? "Unmute Microphone"
                        : "Mute Microphone"
                  }
                >
                  {isMicMuted ? (
                    <FiMicOff className="w-8 h-8" />
                  ) : (
                    <FiMic className="w-8 h-8" />
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Final Prompt Display */}
      {finalPrompt && (
        <div className="bg-white rounded-xl shadow-xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <FaRobot className="text-2xl text-indigo-600" />
            <h2 className="text-xl font-bold text-gray-900">
              AI Assistant Instructions
            </h2>
          </div>
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg p-4 border border-indigo-200">
            <p className="text-sm text-gray-600 mb-2 font-medium">
              This is how your AI assistant has been configured to interact with{" "}
              {childName}:
            </p>
            <div className="bg-white rounded-lg p-4 border border-indigo-100">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono leading-relaxed">
                {finalPrompt}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default VoiceWidget;
