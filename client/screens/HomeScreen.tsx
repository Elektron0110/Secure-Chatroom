import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import ChatListScreen from "@/screens/ChatListScreen";
import ChatScreen from "@/screens/ChatScreen";
import { useTheme } from "@/hooks/useTheme";

interface SelectedChat {
  id: string;
  name: string;
  avatarUrl?: string;
  isOnline?: boolean;
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const [selectedChat, setSelectedChat] = useState<SelectedChat | null>(null);

  const handleChatSelect = (chatId: string, chatName: string, avatarUrl?: string, isOnline?: boolean) => {
    setSelectedChat({ id: chatId, name: chatName, avatarUrl, isOnline });
  };

  const handleBack = () => {
    setSelectedChat(null);
  };

  if (selectedChat) {
    return (
      <ChatScreen
        chatId={selectedChat.id}
        chatName={selectedChat.name}
        avatarUrl={selectedChat.avatarUrl}
        isOnline={selectedChat.isOnline}
        onBack={handleBack}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.backgroundRoot }]}>
      <ChatListScreen onChatSelect={handleChatSelect} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
