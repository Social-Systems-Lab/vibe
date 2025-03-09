import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { useAccountSync } from '@/hooks/useAccountSync';
import { useThemeColor } from '@/hooks/useThemeColor';

interface ServerStatusIndicatorProps {
  compact?: boolean;
}

export default function ServerStatusIndicator({ compact = false }: ServerStatusIndicatorProps) {
  const { serverStatus, isRegistered } = useAccountSync();
  const colorScheme = useColorScheme() ?? 'light';
  
  // Colors for different states
  const getStatusColor = () => {
    switch (serverStatus) {
      case 'online':
        return useThemeColor({}, 'success');
      case 'checking':
        return useThemeColor({}, 'warning');
      case 'offline':
      case 'error':
        return useThemeColor({}, 'danger');
      default:
        return useThemeColor({}, 'gray');
    }
  };
  
  // Icons for different states
  const getStatusIcon = () => {
    switch (serverStatus) {
      case 'online':
        return 'cloud-done';
      case 'checking':
        return 'cloud-sync';
      case 'offline':
        return 'cloud-off';
      case 'error':
        return 'error';
      default:
        return 'cloud-off';
    }
  };
  
  // Text for different states
  const getStatusText = () => {
    switch (serverStatus) {
      case 'online':
        return isRegistered ? 'Connected' : 'Online (not registered)';
      case 'checking':
        return 'Checking...';
      case 'offline':
        return 'Offline';
      case 'error':
        return 'Connection Error';
      default:
        return 'Unknown';
    }
  };
  
  // If compact, just show the icon with a different colored border
  if (compact) {
    return (
      <View style={[styles.compactIndicator, { borderColor: getStatusColor() }]}>
        <MaterialIcons name={getStatusIcon()} size={20} color={getStatusColor()} />
      </View>
    );
  }
  
  // Full indicator with text
  return (
    <View style={styles.container}>
      <View style={[styles.indicator, { backgroundColor: getStatusColor() }]}>
        <MaterialIcons name={getStatusIcon()} size={18} color="white" />
      </View>
      <Text style={styles.text}>{getStatusText()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
  },
  indicator: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  compactIndicator: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'white',
  },
  text: {
    fontSize: 14,
    fontWeight: '500',
  },
});