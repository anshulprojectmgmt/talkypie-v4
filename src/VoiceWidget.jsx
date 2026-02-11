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
import { MdWifiOff } from "react-icons/md";
import { useESP32 } from "./contexts/ESP32Context";
import { useMicrophone } from "./contexts/MicrophoneContext";

let vapi;
let introAudioIntervalID;

const VoiceWidget = () => {
  const { stream } = useMicrophone();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);

  const {
    espCharacteristic,
    isConnected,
    connectionLost,
    acknowledgeConnectionLoss,
  } = useESP32();

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isAssistantOn, setIsAssistantOn] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [assistantId, setAssistantId] = useState(null);
  const [assistantStatus, setAssistantStatus] = useState("pending");
  const [isCreatingAssistant, setIsCreatingAssistant] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const [finalPrompt, setFinalPrompt] = useState("");

  const [childName] = useState(queryParams.get("childName") || "");
  const [age] = useState(queryParams.get("age") || "");
  const [gender] = useState(queryParams.get("gender") || "");
  const [prompt] = useState(queryParams.get("prompt") || "");
  const [toyName] = useState(queryParams.get("toyName") || "Talkypie");
  const [isFormSubmitted] = useState(
    queryParams.get("isFormSubmitted") === "true",
  );
  const customTranscript = queryParams.get("customTranscript") === "true";

  const vapiPrivateKey =
    queryParams.get("vapiKey") || localStorage.getItem("vapiKey");
  const vapiPublicKey =
    queryParams.get("vapiPublicKey") ||
    localStorage.getItem("vapiPublicKey") ||
    "1f568b16-001f-4f1c-8f34-02a4aa1ea376";

  const isAssistantOnRef = useRef(isAssistantOn);
  const hasAutoConnectedRef = useRef(false);

  useEffect(() => {
    isAssistantOnRef.current = isAssistantOn;
  }, [isAssistantOn]);

  useEffect(() => {
    const savedId = localStorage.getItem("assistantId");
    if (savedId) {
      setAssistantId(savedId);
      setAssistantStatus("created");
    }
  }, []);

  const createAssistant = async () => {
    try {
      setIsCreatingAssistant(true);

      const response = await axios.post(
        "https://talkypie-backend-v3.onrender.com/vapi/create-assistant",
        {
          childName,
          age,
          gender,
          vapiKey: vapiPrivateKey,
          prompt,
          toyName,
          customTranscript,
        },
      );

      const newAssistantId = response.data.assistantId;
      const receivedFinalPrompt = response.data.finalPrompt;

      vapi = new Vapi(vapiPublicKey);
      setAssistantId(newAssistantId);
      setFinalPrompt(receivedFinalPrompt || "");
      setAssistantStatus("created");
      localStorage.setItem("assistantId", newAssistantId);
    } catch (error) {
      setAssistantStatus("failed");
      setAssistantError("Failed to create assistant.");
    } finally {
      setIsCreatingAssistant(false);
    }
  };

  // ✅ AUTO CONNECT ONLY ON FIRST LOAD
  useEffect(() => {
    if (
      assistantId &&
      assistantStatus === "created" &&
      isFormSubmitted &&
      !hasAutoConnectedRef.current
    ) {
      hasAutoConnectedRef.current = true;
      toggleAssistant();
    }
  }, [assistantId, assistantStatus]);

  const introAudio = async () => {
    const audio = new Audio("/connect.mp3");
    await audio.play();

    await new Promise((resolve) => {
      audio.onended = resolve;
    });

    introAudioIntervalID = setInterval(() => {
      const repeated = new Audio("/connect.mp3");
      repeated.play();
    }, 5000);
  };

  const startVapiAssistant = async () => {
    if (!assistantId) return;

    const call = await vapi.start(assistantId);
    setIsAssistantOn(true);
    isAssistantOnRef.current = true;

    // ✅ STOP INTRO LOOP ON FIRST SPEECH
    vapi.once("speech-start", () => {
      clearInterval(introAudioIntervalID);
    });
  };

  const endCallProcessing = async () => {
    const audio = new Audio("/disconnect.mp3");
    await audio.play();
  };

  const toggleAssistant = async () => {
    if (!assistantId && !isAssistantOnRef.current) {
      await createAssistant();
      return;
    }

    if (isAssistantOnRef.current) {
      setIsLoading(true);

      // ✅ CLEAR INTRO LOOP SAFELY
      clearInterval(introAudioIntervalID);

      try {
        vapi.stop();
      } catch (e) {}

      setIsAssistantOn(false);
      isAssistantOnRef.current = false;

      await endCallProcessing();

      setIsLoading(false);
    } else {
      setIsLoading(true);
      await introAudio();
      await startVapiAssistant();
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-lg mx-auto bg-white p-8 rounded-xl shadow-xl">
      <h1 className="text-2xl font-bold text-center mb-4">
        Voice Assistant Status
      </h1>

      <p className="text-center mb-4">
        {isAssistantOn ? "Connected" : "Disconnected"}
      </p>

      <div className="flex justify-center">
        <button
          onClick={toggleAssistant}
          className={`rounded-full p-4 text-white ${
            isAssistantOn ? "bg-red-600" : "bg-green-600"
          }`}
        >
          {isAssistantOn ? <FiPhoneOff /> : <FiPhoneCall />}
        </button>
      </div>
    </div>
  );
};

export default VoiceWidget;
