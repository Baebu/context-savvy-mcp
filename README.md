# UnifiedVR: Wireless Mixed-Reality Tracking System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Platform: Windows](https://img.shields.io/badge/Platform-Windows-blue.svg)](https://www.microsoft.com/windows)
[![VR: OpenVR](https://img.shields.io/badge/VR-OpenVR-green.svg)](https://github.com/ValveSoftware/openvr)
[![Unity: 2022.3+](https://img.shields.io/badge/Unity-2022.3+-purple.svg)](https://unity.com/)

## 🚀 Overview

UnifiedVR is a comprehensive wireless VR system that seamlessly integrates **Quest 2 headsets**, **Valve Index controllers**, **Vive 3.0 trackers**, and **Lighthouse base stations** into a unified mixed-reality tracking platform. Experience the freedom of wireless VR with the precision of lighthouse tracking and the versatility of mixed hardware ecosystems.

### ✨ Key Features

- **🔄 Wireless Streaming**: Stream PC VR content to Quest 2 with <20ms latency
- **🎯 Mixed Tracking**: Combine inside-out (Quest) and outside-in (Lighthouse) tracking
- **🎮 Universal Controllers**: Use Index controllers wirelessly with any headset
- **📍 Body Tracking**: Full-body tracking with up to 8 Vive trackers
- **🔧 Auto-Calibration**: Automatic space calibration with drift correction
- **📊 Performance Monitoring**: Real-time performance analysis and optimization
- **🤝 Cross-Platform**: Unity integration with C# APIs and native plugins

## 🏗️ System Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Quest 2       │    │   PC with        │    │  Lighthouse     │
│   (Wireless)    │◄──►│ UnifiedVR Driver │◄──►│  Base Stations  │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ Hand Tracking   │    │ Unity            │    │ Index           │
│ & Gestures      │    │ Integration      │    │ Controllers     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ Vive Trackers    │
                       │ (Body Tracking)  │
                       └──────────────────┘
```

## 🛠️ Technical Specifications

### Performance Targets
- **Latency**: <20ms motion-to-photon (wireless)
- **Frame Rate**: 90Hz sustained, 120Hz capable
- **Tracking Accuracy**: Sub-millimeter precision
- **Network Bandwidth**: 150-300 Mbps (adaptive)
- **Range**: 10m play area with 5GHz WiFi 6

### Hardware Compatibility
| Component | Model | Status | Notes |
|-----------|-------|--------|-------|
| **HMD** | Meta Quest 2/3 | ✅ Full | Primary wireless display |
| **Controllers** | Valve Index | ✅ Full | Finger tracking, haptics |
| **Trackers** | HTC Vive 3.0 | ✅ Full | Up to 8 simultaneous |
| **Base Stations** | Lighthouse 2.0 | ✅ Full | 2-4 stations supported |
| **Dongles** | Generic 2.4GHz | ✅ Full | USB dongles for pairing |

### Software Stack
- **Driver Layer**: OpenVR-compatible native driver (C++)
- **Networking**: Custom UDP protocol with QUIC optimization
- **Tracking**: libsurvive + OpenXR integration
- **Unity Plugin**: Native C# bindings with editor tools
- **Quest Client**: Android Unity application

## 🚀 Quick Start

### Prerequisites
- Windows 10/11 with Visual Studio 2019+
- Unity 2022.3 LTS with XR Plugin Management
- SteamVR installed and configured
- WiFi 6 router (5GHz/6GHz dedicated band recommended)

### Installation
```bash
# Clone the repository
git clone https://github.com/yourusername/UnifiedVR.git
cd UnifiedVR

# Build the system
scripts\build.bat

# Install OpenVR driver
scripts\install_driver.bat

# Run system tests
scripts\test_system.bat
```

### Unity Setup
1. Create new Unity project (2022.3+)
2. Copy `Platforms/Unity/Scripts/` to your project
3. Copy `build/bin/UnifiedVRPlugin.dll` to `Assets/Plugins/`
4. Add `UnifiedVRManager` component to scene
5. Configure network settings and hardware

### Quest 2 Setup
1. Enable Developer Mode on Quest 2
2. Build and deploy `Platforms/Quest2/` Unity project
3. Configure server IP in Quest app
4. Connect to same WiFi network as PC

## 📋 Hardware Setup Guide

### 1. Lighthouse Base Stations
```
📍 Placement Guidelines:
• Mount 2-2.5m high at opposite corners
• Angle down 30-45° toward play area  
• 5-6m maximum distance apart
• Set channels: one to 'b', other to 'c'
• Ensure stable mounting (no vibration)
```

### 2. Index Controllers
```
🎮 Controller Setup:
• Requires 2x USB dongles (pre-flashed)
• Plug dongles into USB 3.0 ports
• Pair through SteamVR room setup
• Verify finger tracking and haptics
• Battery life: ~7 hours per charge
```

### 3. Vive Trackers
```
📡 Tracker Configuration:
• 1 USB dongle per tracker (up to 8)
• Attach to body parts or objects
• Common placements: waist, feet, elbows
• Ensure line-of-sight to base stations
• Battery life: 6-8 hours per charge
```

### 4. Network Optimization
```
🌐 WiFi Configuration:
• Dedicated 5GHz or 6GHz network
• 160MHz channel width (WiFi 6)
• QoS enabled with VR traffic priority
• Router positioned for line-of-sight
• Wired connection for PC preferred
```

## 🔧 Configuration

### Driver Configuration (`config/driver_config.json`)
```json
{
  "wireless": {
    "streamingPort": 9943,
    "maxBitrate": 300000000,
    "enableFoveatedRendering": true,
    "targetLatency": 20
  },
  "tracking": {
    "enableDriftCorrection": true,
    "calibrationFile": "calibration.json",
    "trackingRate": 1000,
    "predictionTime": 0.02
  },
  "display": {
    "renderWidth": 2160,
    "renderHeight": 2160,
    "refreshRate": 90,
    "enableAsyncTimeWarp": true
  }
}
```

### Unity Integration
```csharp
// Basic setup
public UnifiedVRManager unifiedVR;

void Start() {
    // Initialize system
    unifiedVR.Initialize();
    
    // Configure wireless streaming
    unifiedVR.wirelessStreamingPort = 9943;
    unifiedVR.enableWirelessStreaming = true;
    
    // Set play area
    unifiedVR.SetPlayAreaSize(4f, 4f);
    
    // Start streaming
    unifiedVR.StartWirelessStreaming();
}
```

## 📊 Performance Monitoring

The system includes comprehensive performance monitoring:

### Real-time Metrics
- Frame time and FPS tracking
- Network latency measurement  
- Tracking quality assessment
- Memory usage monitoring
- Device connection status

### Performance Tools
```bash
# Launch performance monitor
Tools\Monitor\Monitor.exe

# Generate performance report
Tools\Monitor\Monitor.exe --report --duration 300

# Export metrics to CSV
Tools\Monitor\Monitor.exe --export metrics.csv
```

### Optimization Recommendations
The system automatically provides optimization suggestions:
- Network configuration improvements
- Hardware placement recommendations
- Quality setting adjustments
- System resource optimization

## 🎯 Calibration Process

### Automatic Calibration
1. **Connect Devices**: Ensure all hardware is connected and tracked
2. **Start Calibration**: Press `C` or use Unity interface
3. **Collect Points**: Move around with paired devices simultaneously
4. **Wait for Completion**: System automatically computes transform
5. **Validation**: Test accuracy and save calibration

### Manual Calibration
```csharp
// Start calibration programmatically
unifiedVR.StartCalibration();

// Check completion status
if (unifiedVR.IsCalibrationComplete()) {
    unifiedVR.SaveCalibration();
}

// Load existing calibration
unifiedVR.LoadCalibration();
```

### Drift Correction
The system includes continuous drift correction:
- Real-time tracking comparison
- Automatic adjustment algorithms
- Configurable correction thresholds
- Manual recalibration triggers

## 🤝 API Reference

### Core Components

#### UnifiedVRManager
```csharp
public class UnifiedVRManager : MonoBehaviour {
    // System Control
    public bool Initialize();
    public void Shutdown();
    
    // Wireless Streaming
    public bool StartWirelessStreaming();
    public void StopWirelessStreaming();
    public bool IsWirelessConnected();
    
    // Device Management
    public DeviceInfo[] GetDevices();
    public bool GetDevicePose(int deviceId, out Pose pose);
    public bool GetDeviceInput(int deviceId, out InputState input);
    
    // Calibration
    public bool StartCalibration();
    public bool IsCalibrationComplete();
    public void SaveCalibration();
    public void LoadCalibration();
    
    // Events
    public event Action<DeviceInfo> OnDeviceConnected;
    public event Action<int> OnDeviceDisconnected;
    public event Action OnCalibrationComplete;
}
```

#### VRHandTracker
```csharp
public class VRHandTracker : MonoBehaviour {
    // Hand State
    public bool IsTracking { get; }
    public Vector3 HandPosition { get; }
    public Quaternion HandRotation { get; }
    public HandGesture CurrentGesture { get; }
    
    // Interaction
    public bool IsPinching { get; }
    public bool IsGrasping { get; }
    public GameObject GrabbedObject { get; }
    
    // Finger Tracking
    public float GetFingerCurl(int fingerIndex);
    public Vector3 GetFingerTipPosition(int fingerIndex);
    
    // Events
    public event Action<HandGesture> OnGestureRecognized;
    public event Action<GameObject> OnObjectGrabbed;
    public event Action<GameObject> OnObjectReleased;
}
```

## 🐛 Troubleshooting

### Common Issues

#### Driver Not Loading
```bash
# Check SteamVR logs
type "%LOCALAPPDATA%\openvr\vrserver.txt"

# Verify driver installation
scripts\test_system.bat

# Enable multiple drivers in SteamVR settings
# Developer > "Activate Multiple Drivers" = ON
```

#### Poor Wireless Performance
```bash
# Check network configuration
ipconfig /all
ping [quest-ip-address]

# Optimize WiFi settings
# - Use 5GHz dedicated network
# - Set channel width to 160MHz
# - Enable QoS for VR traffic
```

#### Tracking Issues
```bash
# Recalibrate tracking system
# - Press 'C' in Unity scene
# - Follow calibration instructions
# - Ensure line-of-sight to base stations

# Check device connections
# - Verify all devices show in SteamVR
# - Test tracking coverage in play area
# - Update base station firmware
```

### Performance Optimization

#### Network Optimization
- **Router Placement**: Position for direct line-of-sight
- **Channel Selection**: Use WiFi analyzer to find clear channels
- **QoS Configuration**: Prioritize VR traffic over other devices
- **Bandwidth Allocation**: Reserve 300+ Mbps for VR streaming

#### System Optimization
- **GPU Performance**: Set to maximum performance mode
- **CPU Priority**: High priority for UnifiedVR processes
- **Memory Management**: Ensure 8GB+ available
- **Background Apps**: Close unnecessary applications

## 📈 Development Roadmap

### Current Version (v1.0)
- ✅ Basic wireless streaming
- ✅ Mixed tracking system integration
- ✅ Unity plugin with C# APIs
- ✅ Performance monitoring tools
- ✅ Automatic calibration system

### Upcoming Features (v1.1)
- 🔄 Eye tracking integration (Quest Pro)
- 🔄 Facial tracking support
- 🔄 Advanced gesture recognition
- 🔄 Multi-user support
- 🔄 Cloud calibration sync

### Future Plans (v2.0)
- 📋 AR passthrough integration
- 📋 AI-powered optimization
- 📋 Wireless base station support
- 📋 Cross-platform compatibility (Linux/Mac)
- 📋 WebXR integration

## 🤝 Contributing

We welcome contributions! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

### Development Setup
```bash
# Fork and clone the repository  
git clone https://github.com/yourusername/UnifiedVR.git

# Create development branch
git checkout -b feature/your-feature-name

# Make changes and test
scripts\build.bat
scripts\test_system.bat

# Submit pull request
```

### Areas for Contribution
- Performance optimization algorithms
- Additional hardware support
- Cross-platform compatibility
- Documentation improvements
- Bug fixes and testing

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Valve Software** - OpenVR SDK and SteamVR ecosystem
- **Meta** - Quest development platform and OpenXR SDK
- **HTC** - Vive tracker hardware and development resources
- **Collabora** - libsurvive open-source tracking library
- **Unity Technologies** - XR development platform
- **VR Community** - Invaluable feedback and testing

## 🔗 Links

- **Documentation**: [Full Documentation](./SETUP_GUIDE.md)
- **API Reference**: [API Documentation](./docs/API.md)
- **Troubleshooting**: [Troubleshooting Guide](./docs/TROUBLESHOOTING.md)
- **Discord**: [Community Discord Server](#)
- **YouTube**: [Setup and Demo Videos](#)

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/UnifiedVR/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/UnifiedVR/discussions)
- **Email**: support@unifiedvr.dev
- **Discord**: Join our community server for real-time help

---

**Made with ❤️ for the VR community**

*Bringing together the best of wireless freedom and precision tracking*
